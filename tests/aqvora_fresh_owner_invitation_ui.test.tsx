import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
const h = vi.hoisted(() => ({
  allowed: vi.fn(() => true),
  invite: vi.fn(), accept: vi.fn(),
  role: "OWNER" as string,
  org: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  cloud: true,
}));
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const INTENT = "33333333-3333-4333-8333-333333333333";
vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({
    organization: { id: h.org }, user: { id: USER, role: h.role },
    isCloudAccount: h.cloud, isDemoMode: false,
  }),
}));
vi.mock("../src/services/aqvoraFreshOwnerInvitationService", () => ({
  isFreshOwnerInvitationStagingEnabled: h.allowed,
  normalizeInviteEmail: (email: string) => email.trim().toLowerCase(),
  createFreshOwnerInvitation: h.invite,
  acceptFreshOwnerInvitation: h.accept,
}));
import { FreshOwnerInvitationsWorkspace } from
  "../src/components/accounting/FreshOwnerInvitationsWorkspace";
import { getStagingFinanceNavItems } from
  "../src/components/accounting/stagingFinanceNavigation";

const receipt = {
  organization_id: ORG, invitation_id: ID, invite_intent: INTENT,
  status: "awaiting_verified_owner_acceptance",
  expires_at: "2026-11-28T12:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.allowed.mockReturnValue(true);
  h.org = ORG; h.role = "OWNER"; h.cloud = true;
  h.invite.mockResolvedValue(receipt);
  h.accept.mockResolvedValue({
    organization_id: ORG, invitation_id: ID, accepted_by: USER,
    accepted_at: "2026-11-21T12:00:00Z", status: "verified_owner_joined",
  });
  vi.stubGlobal("crypto", { randomUUID: () => INTENT });
});
describe("Isolated fresh OWNER invitation UX", () => {
  it("exposes acceptance for authenticated non-owner recipients", () => {
    h.role = "CASHIER";
    expect(getStagingFinanceNavItems({
      isCloudAccount: true, isDemoMode: false, role: "CASHIER",
    }).some(item => item.id === "aqvora-owner-invites")).toBe(true);
    render(<FreshOwnerInvitationsWorkspace />);
    expect(screen.getByRole("button", {name:"Accept as verified OWNER"})).toBeTruthy();
    expect(screen.queryByRole("button", {name:"Create secure invitation"})).toBeNull();
  });
  it("never exposes invitation actions when cloud or isolated staging is off", () => {
    h.allowed.mockReturnValue(false);
    const view = render(<FreshOwnerInvitationsWorkspace />);
    expect(screen.queryByRole("button", {name:"Accept as verified OWNER"})).toBeNull();
    expect(h.invite).not.toHaveBeenCalled();
    expect(getStagingFinanceNavItems({
      isCloudAccount: true, isDemoMode: false, role: "CASHIER",
    })).toEqual([]);
    h.allowed.mockReturnValue(true);
    h.cloud = false;
    view.rerender(<FreshOwnerInvitationsWorkspace />);
    expect(screen.queryByRole("button", {name:"Accept as verified OWNER"})).toBeNull();
  });
  it("issues a manual out-of-band invitation without claiming email delivery", async () => {
    render(<FreshOwnerInvitationsWorkspace />);
    fireEvent.change(screen.getByRole("textbox", {name:"Recipient's verified email"}), {
      target: {value:"Second@EXAMPLE.COM"},
    });
    fireEvent.click(screen.getByRole("button", {name:"Create secure invitation"}));
    await waitFor(() => expect(h.invite).toHaveBeenCalledOnce());
    expect(h.invite.mock.calls[0][1]).toEqual({
      organizationId: ORG, email:"second@example.com", inviteIntent:INTENT,
    });
    expect(await screen.findByText(/No email has been sent/)).toBeTruthy();
    expect(screen.getByText(/Awaiting recipient acceptance/)).toBeTruthy();
    expect(screen.getByText(/never activates posting/)).toBeTruthy();
  });
  it("denied issue is never shown as success and original intent stays for retry", async () => {
    h.invite.mockRejectedValueOnce(new Error("MFA required"));
    render(<FreshOwnerInvitationsWorkspace />);
    fireEvent.change(screen.getByRole("textbox", {name:"Recipient's verified email"}), {
      target:{value:"second@example.com"},
    });
    fireEvent.click(screen.getByRole("button", {name:"Create secure invitation"}));
    await screen.findByRole("alert");
    expect(screen.queryByText(/Awaiting recipient acceptance/)).toBeNull();
    fireEvent.click(screen.getByRole("button", {name:"Create secure invitation"}));
    await waitFor(() => expect(h.invite).toHaveBeenCalledTimes(2));
    expect(h.invite.mock.calls[1][1].inviteIntent).toBe(
      h.invite.mock.calls[0][1].inviteIntent,
    );
  });
  it("recipient verifies membership but never reports writer activation", async () => {
    h.role = "CASHIER";
    render(<FreshOwnerInvitationsWorkspace />);
    fireEvent.change(screen.getByRole("textbox", {name:"Inviting company UUID"}), {
      target: {value:ORG},
    });
    fireEvent.change(screen.getByRole("textbox", {name:"Invitation UUID"}), {
      target: {value:ID},
    });
    fireEvent.click(screen.getByRole("button", {name:"Accept as verified OWNER"}));
    expect(await screen.findByText(/Server confirmed OWNER membership/)).toBeTruthy();
    expect(h.accept.mock.calls[0][1]).toEqual({
      organizationId: ORG, invitationId:ID,
    });
    expect(screen.getByText(/does not enable journal posting/)).toBeTruthy();
  });
});
