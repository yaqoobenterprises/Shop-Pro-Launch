import { describe, expect, it } from "vitest";
import { resolveCloudWorkspace } from "../src/lib/cloudWorkspaceGuard";
import type { Organization, UserProfile } from "../src/types";

const org: Organization = {
  id: "shop-a", name: "Example Company", owner_name: "Operator",
  currency: "PKR", currency_symbol: "Rs.", country: "Pakistan",
  timezone: "Asia/Karachi", business_category: "", tax_rate: 0,
  tax_enabled: false, invoice_prefix: "EX-", next_invoice_number: 1,
  created_at: "2026-11-20T00:00:00Z",
};
const profile: UserProfile = {
  id: "user-a", organization_id: org.id, role: "OWNER",
  email: "a@example.invalid", full_name: "Operator", is_active: true,
  created_at: "2026-11-20T00:00:00Z",
};
const membership = {
  user_id: profile.id, organization_id: org.id, role: "OWNER", is_active: true,
};

describe("verified cloud company activation", () => {
  it("requires profile, real organization and canonical active membership", () => {
    expect(resolveCloudWorkspace(profile.id, profile, org, membership)).toMatchObject({
      ok: true, profile: { role: "OWNER" }, organization: { id: org.id },
    });
  });
  it("does not synthesize an OWNER account when provisioning has not finished", () => {
    expect(resolveCloudWorkspace(profile.id, null, null, null)).toEqual({ ok: false });
    expect(resolveCloudWorkspace(profile.id, profile, null, membership)).toEqual({ ok: false });
    expect(resolveCloudWorkspace(profile.id, profile, org, null)).toEqual({ ok: false });
  });
  it("blocks inactive users, revoked memberships and cross-company identities", () => {
    expect(resolveCloudWorkspace(profile.id, { ...profile, is_active: false }, org, membership)).toEqual({ ok: false });
    expect(resolveCloudWorkspace(profile.id, profile, org, { ...membership, is_active: false })).toEqual({ ok: false });
    expect(resolveCloudWorkspace(profile.id, profile, org, { ...membership, organization_id: "shop-b" })).toEqual({ ok: false });
    expect(resolveCloudWorkspace("another-user", profile, org, membership)).toEqual({ ok: false });
    expect(resolveCloudWorkspace(profile.id, profile, { ...org, id: "shop-b" }, membership)).toEqual({ ok: false });
  });
  it("uses the active canonical membership role, never the stale profile role", () => {
    const result = resolveCloudWorkspace(profile.id, profile, org, { ...membership, role: "CASHIER" });
    expect(result).toMatchObject({ ok: true, profile: { role: "CASHIER" } });
    expect(resolveCloudWorkspace(profile.id, profile, org, { ...membership, role: "ADMIN" })).toEqual({ ok: false });
  });
});
