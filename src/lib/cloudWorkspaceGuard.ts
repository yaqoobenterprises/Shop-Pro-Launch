import type { Organization, UserProfile, UserRole } from "../types";

/** Do not activate a cloud company based on profile metadata or a cached role. */
export type CloudMembership = {
  user_id: string;
  organization_id: string;
  role: string;
  is_active: boolean | null;
};

export function resolveCloudWorkspace(
  authUserId: string,
  profile: UserProfile | null,
  organization: Organization | null,
  membership: CloudMembership | null,
): { ok: true; profile: UserProfile; organization: Organization } | { ok: false } {
  if (!authUserId || !profile || profile.id !== authUserId ||
      !profile.organization_id || profile.is_active !== true) return { ok: false };
  if (!organization || organization.id !== profile.organization_id) return { ok: false };
  if (!membership || membership.user_id !== authUserId ||
      membership.organization_id !== organization.id ||
      membership.is_active !== true) return { ok: false };
  if (!(["OWNER", "MANAGER", "CASHIER"] as string[]).includes(membership.role)) {
    return { ok: false };
  }

  // The membership is canonical. Profile roles may lag a demotion or promotion.
  return {
    ok: true,
    profile: { ...profile, role: membership.role as UserRole },
    organization,
  };
}
