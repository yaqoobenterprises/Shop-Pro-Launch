import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  staging: vi.fn(() => true),
  session: vi.fn(async () => true),
  getUser: vi.fn(),
  assurance: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("../src/services/aqvoraVerifiedFinancialReadService", () => ({
  isIsolatedVerifiedFinancialReadEnabled: h.staging,
}));
vi.mock("../src/lib/supabase", () => ({
  hasConfiguredCloudSession: h.session,
  getSupabaseClient: () => ({
    auth: { getUser: h.getUser,
      mfa: { getAuthenticatorAssuranceLevel: h.assurance } },
    rpc: h.rpc,
  }),
}));
import {
  acceptFreshOwnerInvitation, createFreshOwnerInvitation,
  isFreshOwnerInvitationStagingEnabled, normalizeInviteEmail,
} from "../src/services/aqvoraFreshOwnerInvitationService";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";
const INVITE = "22222222-2222-4222-8222-222222222222";
const INTENT = "33333333-3333-4333-8333-333333333333";
const ctx = { userId: USER, isCloudAccount: true, isDemoMode: false };
const issued = {
  organization_id: ORG, invitation_id: INVITE, invite_intent: INTENT,
  expires_at: "2026-11-28T12:00:00+00:00",
  status: "awaiting_verified_owner_acceptance",
};
const accepted = {
  organization_id: ORG, invitation_id: INVITE, accepted_by: USER,
  accepted_at: "2026-11-21T12:00:00+00:00",
  status: "verified_owner_joined",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VITE_ENABLE_AQVORA_OWNER_INVITES", "true");
  h.staging.mockReturnValue(true);
  h.session.mockResolvedValue(true);
  h.getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
  h.assurance.mockResolvedValue({ data: { currentLevel: "aal2" }, error: null });
  h.rpc.mockImplementation(async (name: string) => ({
    data: name === "create_aqvora_fresh_owner_invite" ? issued : accepted,
    error: null,
  }));
});

describe("Second OWNER invitations: isolated staging transport", () => {
  it("normalizes email, passes the original intent and returns only matching receipts", async () => {
    expect(normalizeInviteEmail("  Second.Owner@Example.COM ")).toBe("second.owner@example.com");
    expect(isFreshOwnerInvitationStagingEnabled()).toBe(true);
    const receipt = await createFreshOwnerInvitation(ctx, {
      organizationId: ORG, inviteIntent: INTENT, email: " Second.Owner@Example.COM ",
    });
    expect(receipt).toEqual(issued);
    expect(h.rpc).toHaveBeenCalledWith("create_aqvora_fresh_owner_invite", {
      p_organization_id: ORG, p_invite_intent: INTENT,
      p_invitee_email: "second.owner@example.com",
    });
    expect(h.getUser).toHaveBeenCalledTimes(2);
    expect(h.assurance).toHaveBeenCalledTimes(2);
  });
  it("accepts only a receipt for the current verified recipient", async () => {
    const receipt = await acceptFreshOwnerInvitation(ctx, {
      organizationId: ORG, invitationId: INVITE,
    });
    expect(receipt).toEqual(accepted);
    expect(h.rpc).toHaveBeenCalledWith("accept_aqvora_fresh_owner_invite", {
      p_organization_id: ORG, p_invitation_id: INVITE,
    });
  });
  it("never trusts foreign or malformed success responses", async () => {
    h.rpc.mockResolvedValueOnce({data:{...issued,organization_id:INVITE},error:null});
    await expect(createFreshOwnerInvitation(ctx, {
      organizationId: ORG, inviteIntent: INTENT, email: "second@example.com",
    })).rejects.toThrow(/mismatched/);
    h.rpc.mockResolvedValueOnce({data:{...accepted,accepted_by:INVITE},error:null});
    await expect(acceptFreshOwnerInvitation(ctx, {
      organizationId: ORG, invitationId: INVITE,
    })).rejects.toThrow(/foreign/);
  });
  it("blocks missing MFA, stale session, demo and non-staging before SQL mutations", async () => {
    h.assurance.mockResolvedValue({data:{currentLevel:"aal1"},error:null});
    await expect(acceptFreshOwnerInvitation(ctx, {
      organizationId: ORG, invitationId: INVITE,
    })).rejects.toThrow(/MFA/);
    h.assurance.mockResolvedValue({data:{currentLevel:"aal2"},error:null});
    h.session.mockResolvedValue(false);
    await expect(acceptFreshOwnerInvitation(ctx, {
      organizationId: ORG, invitationId: INVITE,
    })).rejects.toThrow(/isolated/);
    h.session.mockResolvedValue(true);
    h.staging.mockReturnValue(false);
    await expect(createFreshOwnerInvitation(ctx, {
      organizationId: ORG, inviteIntent: INTENT, email: "second@example.com",
    })).rejects.toThrow(/isolated/);
    h.staging.mockReturnValue(true);
    await expect(createFreshOwnerInvitation({...ctx,isDemoMode:true}, {
      organizationId: ORG, inviteIntent: INTENT, email: "second@example.com",
    })).rejects.toThrow(/isolated/);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("validates UUID and email before calls, fails closed on server errors", async () => {
    await expect(createFreshOwnerInvitation(ctx, {
      organizationId:"wrong",inviteIntent:INTENT,email:"person@example.com",
    })).rejects.toThrow(/valid/);
    await expect(createFreshOwnerInvitation(ctx, {
      organizationId:ORG,inviteIntent:INTENT,email:"invalid email",
    })).rejects.toThrow(/valid/);
    await expect(acceptFreshOwnerInvitation(ctx, {
      organizationId:ORG,invitationId:"bad",
    })).rejects.toThrow(/valid/);
    expect(h.rpc).not.toHaveBeenCalled();
    h.rpc.mockResolvedValueOnce({data:null,error:{message:"permission denied"}});
    await expect(acceptFreshOwnerInvitation(ctx, {
      organizationId:ORG,invitationId:INVITE,
    })).rejects.toThrow(/permission denied/);
  });
});
