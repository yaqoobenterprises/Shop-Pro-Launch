import { UserProfile } from "../types";
import { getSupabaseClient, hasActiveSupabaseSession, isSupabaseConfigured } from "../lib/supabase";
import { sqliteRepository } from "./sqliteRepository";
import { getErrorMessage } from "../lib/authErrors";

export type ProfileUpdates = {
  full_name?: string;
  avatar_url?: string | null;
};

export async function saveProfileUpdates(
  user: UserProfile,
  isCloudAccount: boolean,
  updates: ProfileUpdates,
): Promise<{ success: true; user: UserProfile } | { success: false; error: string }> {
  const cleanName = updates.full_name?.trim();
  if (updates.full_name !== undefined && !cleanName) {
    return { success: false, error: "Enter your name." };
  }

  const cleanUpdates: Partial<Pick<UserProfile, "full_name" | "avatar_url">> = {
    ...(cleanName !== undefined ? { full_name: cleanName } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, "avatar_url")
      ? { avatar_url: updates.avatar_url || "" }
      : {}),
  };

  try {
    if (isCloudAccount) {
      if (!isSupabaseConfigured() || !(await hasActiveSupabaseSession(user.id))) {
        throw new Error("Your cloud session has expired. Sign in again to update your profile.");
      }
      const { data, error } = await getSupabaseClient()
        .from("profiles")
        .update(cleanUpdates)
        .eq("id", user.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Your profile could not be found in the cloud account.");
    }
    await sqliteRepository.updateProfile({ id: user.id, ...cleanUpdates });
    return { success: true, user: { ...user, ...cleanUpdates } };
  } catch (error) {
    return { success: false, error: getErrorMessage(error, "Could not update your profile.") };
  }
}
