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
    if (status === "ready") return true;
    if (status === "mfa_required") return false;
  }
  activateLocally(profile, organization);
  return true;
}
