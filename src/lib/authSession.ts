export type SupabaseActivationStatus = "ready" | "mfa_required" | "failed";

export async function activateProfileAfterPinUnlock<TProfile extends { id: string }, TOrganization>(
  profile: TProfile,
  organization: TOrganization,
  hasMatchingSession: (userId: string) => Promise<boolean>,
  activateSession: (userId: string) => Promise<SupabaseActivationStatus>,
  activateLocally: (profile: TProfile, organization: TOrganization) => void,
): Promise<boolean> {
  if (await hasMatchingSession(profile.id)) {
    const status = await activateSession(profile.id);
    // A failed cloud authorization check cannot be bypassed by the cached
    // profile's potentially stale local role.
    return status === "ready";
  }
  activateLocally(profile, organization);
  return true;
}
