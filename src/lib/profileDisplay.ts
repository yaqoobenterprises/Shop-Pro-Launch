import { UserProfile } from "../types";

function isPlaceholderName(name: string | undefined, email?: string): boolean {
  const normalized = name?.trim().toLocaleLowerCase();
  if (!normalized || normalized.includes("@")) return true;
  const emailLocalPart = email?.trim().toLocaleLowerCase().split("@")[0];
  return Boolean(emailLocalPart && normalized === emailLocalPart);
}

export function getProfileDisplayName(
  user?: Pick<UserProfile, "full_name" | "email"> | null,
  ...fallbackNames: Array<string | undefined>
): string {
  if (user?.full_name && !isPlaceholderName(user.full_name, user.email)) {
    return user.full_name.trim();
  }

  for (const name of fallbackNames) {
    if (name && !isPlaceholderName(name, user?.email)) return name.trim();
  }

  return "Shop Owner";
}

export function isPlaceholderProfileName(name: string | undefined, email?: string): boolean {
  return isPlaceholderName(name, email);
}
