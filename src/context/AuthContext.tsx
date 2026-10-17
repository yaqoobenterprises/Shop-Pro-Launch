import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Organization, UserProfile } from "../types";
import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabase";
import { sqliteRepository } from "../services/sqliteRepository";
import { StorageEngine } from "../services/storageEngine";
import { syncEngine } from "../services/syncEngine";
import { setSecurityPrincipal } from "../lib/security";
import { setupDemoWorkspace, cleanupDemoWorkspace } from "../services/demoModeService";
import { isPlaceholderProfileName } from "../lib/profileDisplay";
import { hashPassword, hashPin, MIN_PIN_LENGTH, verifyPassword, verifyPin } from "../lib/authCredentials";
import { getErrorMessage } from "../lib/authErrors";
import { saveProfileUpdates } from "../services/profileService";

const ACTIVE_PROFILE_KEY = "yaqoob_active_profile";

const EMPTY_ORGANIZATION: Organization = {
  id: "",
  name: "",
  owner_name: "",
  currency: "PKR",
  currency_symbol: "Rs.",
  country: "Pakistan",
  timezone: "Asia/Karachi",
  region_configured: false,
  business_category: "",
  tax_rate: 0,
  tax_enabled: false,
  invoice_prefix: "YE-",
  next_invoice_number: 1001,
  created_at: "",
};

interface AuthContextType {
  user: UserProfile | null;
  organization: Organization;
  role: UserProfile["role"] | null;
  isSupabaseReady: boolean;
  isCloudAccount: boolean;
  isLoading: boolean;
  isLocked: boolean;
  hasLocalAccount: boolean;
  hasPasswordAccount: boolean;
  hasPinSetup: boolean;
  isPasswordRecovery: boolean;
  unlock: (pin: string) => Promise<boolean>;
  lock: () => void;
  setupPin: (newPin: string) => Promise<{ success: boolean; error?: string }>;
  updatePin: (
    currentPin: string,
    newPin: string,
  ) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (
    newPassword: string,
    currentPassword?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<{ success: boolean; error?: string }>;
  updateProfilePhoto: (
    avatarUrl: string,
  ) => Promise<{ success: boolean; error?: string }>;
  updateProfile: (updates: {
    full_name?: string;
    avatar_url?: string | null;
  }) => Promise<{ success: boolean; error?: string }>;
  mfaChallengeRequired: boolean;
  verifyMfaChallenge: (code: string) => Promise<{ success: boolean; error?: string }>;
  cancelMfaChallenge: () => Promise<void>;
  createAccount: (details: {
    shopName: string;
    ownerName: string;
    email: string;
    pin: string;
    confirmPin: string;
    password?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  onboardingCompleted: boolean;
  signIn: (email: string, pass: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    pass: string,
    fullName: string,
    orgName: string,
  ) => Promise<{ error?: string; emailConfirmationRequired?: boolean; rateLimitExceeded?: boolean }>;
  signInWithGoogle: () => Promise<{ error?: string; authUrl?: string; pendingPopup?: boolean }>;
  sendPasswordReset: (email: string) => Promise<{ error?: string; message?: string }>;
  completePasswordReset: (newPassword: string) => Promise<{ error?: string }>;
  cancelPasswordReset: () => void;
  resetConnectionAndSession: () => Promise<void>;
  signOut: () => Promise<void>;
  updateOrganization: (org: Partial<Organization>) => void;
  completeOnboarding: (orgData: Partial<Organization>) => void;
  isDemoMode: boolean;
  enterDemoMode: () => Promise<void>;
  exitDemoMode: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [organization, setOrganization] =
    useState<Organization>(EMPTY_ORGANIZATION);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserProfile["role"] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(true);
  const [hasLocalAccount, setHasLocalAccount] = useState(false);
  const [hasPasswordAccount, setHasPasswordAccount] = useState(false);
  const [isCloudAccount, setIsCloudAccount] = useState(false);
  const [mfaChallengeRequired, setMfaChallengeRequired] = useState(false);
  const [pendingMfaProfileId, setPendingMfaProfileId] = useState<string | null>(null);
  const [hasPinSetup, setHasPinSetup] = useState(false);
  const [localAccount, setLocalAccount] =
    useState<Awaited<ReturnType<typeof sqliteRepository.getLocalAuthAccount>>>(
      null,
    );
  const [error, setError] = useState<string | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    return typeof window !== "undefined" && localStorage.getItem("yaqoob_demo_mode") === "true";
  });
  const isSupabaseReady = isSupabaseConfigured();
  const activateSupabaseSessionRef = useRef<
    ((profileId: string) => Promise<"ready" | "mfa_required" | "failed">) | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    const activateSession = (profileId: string) =>
      activateSupabaseSessionRef.current?.(profileId) ?? Promise.resolve("failed" as const);

    // Check if URL contains password recovery hash or parameter
    if (typeof window !== "undefined") {
      const hash = window.location.hash || "";
      const search = window.location.search || "";
      if (
        hash.includes("type=recovery") ||
        search.includes("type=recovery") ||
        hash.includes("type=invite")
      ) {
        setIsPasswordRecovery(true);
      }
    }

    async function initialize() {
      setIsLoading(true);
      setSecurityPrincipal(null);
      try {
        if (typeof window !== "undefined" && localStorage.getItem("yaqoob_demo_mode") === "true") {
          const { organization: demoOrg, profile: demoProfile } = await setupDemoWorkspace();
          if (!cancelled) {
            setIsDemoMode(true);
            activate(demoProfile, demoOrg);
            setHasLocalAccount(true);
            setHasPasswordAccount(true);
            setHasPinSetup(false);
            setIsLocked(false);
            setIsLoading(false);
            return;
          }
        }

        await sqliteRepository.migrateLegacyLocalStorage();

        const isExplicitlySignedOut =
          typeof window !== "undefined" &&
          localStorage.getItem("yaqoob_signed_out") === "true";

        const activeProfileId =
          typeof window !== "undefined" ?
            localStorage.getItem(ACTIVE_PROFILE_KEY) || undefined
          : undefined;

        // If user explicitly signed out and didn't select an active profile, don't auto-login first account
        const account =
          isExplicitlySignedOut && !activeProfileId ?
            null
          : await sqliteRepository.getLocalAuthAccount(activeProfileId);

        if (cancelled) return;
        setLocalAccount(account);
        setHasLocalAccount(Boolean(account));
        setHasPinSetup(Boolean(account?.pin_hash));

        if (account) {
          const [localOrg, profile] = await Promise.all([
            sqliteRepository.getOrganization(account.organization_id),
            sqliteRepository.getSessionProfile(account.profile_id),
          ]);
          if (localOrg) setOrganization(localOrg);
          if (profile) {
            setHasPasswordAccount(Boolean(profile.password_hash));
            if (localOrg && !account.pin_hash) {
              activate(profile, localOrg);
            } else {
              setUser(profile);
              setRole(profile.role);
              setIsLocked(Boolean(account.pin_hash));
            }
          }
        }

        if (account && (typeof navigator === "undefined" || navigator.onLine))
          syncEngine.syncNow().catch(() => {});

        if (isSupabaseConfigured()) {
          const sessionResult = await getSupabaseClient().auth.getSession();
          if (!cancelled && sessionResult.data.session?.user.id) {
            if (typeof window !== "undefined") {
              localStorage.removeItem("yaqoob_signed_out");
            }
            await activateSession(sessionResult.data.session.user.id);
          }
        }
      } catch (initializationError) {
        console.warn("Auth initialization warning:", initializationError);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void initialize();

    let authSubscription: { unsubscribe: () => void } | null = null;
    if (isSupabaseConfigured()) {
      const { data } = getSupabaseClient().auth.onAuthStateChange(
        async (event, session) => {
          if (event === "PASSWORD_RECOVERY") {
            setIsPasswordRecovery(true);
            return;
          }
          if (
            !cancelled &&
            session?.user?.id &&
            (event === "SIGNED_IN" || event === "USER_UPDATED")
          ) {
            if (typeof window !== "undefined") {
              localStorage.removeItem("yaqoob_signed_out");
            }
            await activateSession(session.user.id);
          }
        },
      );
      authSubscription = data.subscription;
    }

    // Cross-window communication listener for Google OAuth popup
    const handleAuthMessage = async (event: MessageEvent) => {
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        if (isSupabaseConfigured()) {
          try {
            if (event.data.accessToken && event.data.refreshToken) {
              const { data } = await getSupabaseClient().auth.setSession({
                access_token: event.data.accessToken,
                refresh_token: event.data.refreshToken,
              });
              if (data?.session?.user?.id) {
                if (typeof window !== "undefined") {
                  localStorage.removeItem("yaqoob_signed_out");
                }
                await activateSession(data.session.user.id);
                return;
              }
            }

            const sessionResult = await getSupabaseClient().auth.getSession();
            if (!cancelled && sessionResult.data.session?.user.id) {
              if (typeof window !== "undefined") {
                localStorage.removeItem("yaqoob_signed_out");
              }
              await activateSession(sessionResult.data.session.user.id);
            }
          } catch (e) {
            console.warn("OAuth session handling warning:", e);
          }
        }
      } else if (event.data?.type === "OAUTH_AUTH_ERROR") {
        const desc = event.data.errorDescription || "";
        const code = event.data.errorCode || event.data.error || "";
        if (
          code === "403" ||
          code === "access_denied" ||
          desc.toLowerCase().includes("access_denied")
        ) {
          setError(
            "Google sign-in is not available for this account yet. The app owner needs to finish Google OAuth access setup.",
          );
        } else if (
          desc.toLowerCase().includes("redirect_uri_mismatch") ||
          code === "redirect_uri_mismatch"
        ) {
          setError(
            "Google Sign-In configuration mismatch: The current application redirect URI is not listed under Authorized Redirect URIs in your Google Cloud Console OAuth Client credentials.",
          );
        } else {
          setError(desc || "Google authentication was cancelled or encountered an error.");
        }
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("message", handleAuthMessage);
    }

    return () => {
      cancelled = true;
      authSubscription?.unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener("message", handleAuthMessage);
      }
    };
  }, [isSupabaseReady]);

  const activate = (profile: UserProfile, org: Organization, cloudAccount = false) => {
    setOrganization(org);
    setUser(profile);
    setIsCloudAccount(cloudAccount);
    setRole(profile.role);
    setSecurityPrincipal(profile);
    setIsLocked(false);
    if (typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_PROFILE_KEY, profile.id);
      localStorage.removeItem("yaqoob_signed_out");
    }
  };

  const activateSupabaseSession = async (
    profileId: string,
  ): Promise<"ready" | "mfa_required" | "failed"> => {
    setIsCloudAccount(false);
    const client = getSupabaseClient();

    // 1. Verify user exists in Supabase auth.users (critical if user accounts were deleted in Supabase)
    let authUser: any = null;
    try {
      const { data: authUserData, error: userError } = await client.auth.getUser();
      if (userError || !authUserData?.user) {
        console.warn(
          "Supabase auth user does not exist or was deleted:",
          userError?.message,
        );
        try {
          await client.auth.signOut({ scope: "local" });
        } catch {
          console.warn("Could not clear the stale Supabase session before reset.");
        }
        if (typeof window !== "undefined") {
          localStorage.removeItem(ACTIVE_PROFILE_KEY);
          localStorage.removeItem("yaqoob_signed_out");
        }
        setUser(null);
        setRole(null);
        setIsCloudAccount(false);
        setIsLocked(true);
        setError(
          "Your previous cloud session expired or user accounts were reset in Supabase. Please sign in or create a new account.",
        );
        return "failed";
      }
      authUser = authUserData.user;
    } catch (e) {
      console.warn("Could not verify auth user in Supabase:", e);
      return "failed";
    }

    try {
      const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assurance.currentLevel === "aal1" && assurance.nextLevel === "aal2") {
        setPendingMfaProfileId(profileId);
        setMfaChallengeRequired(true);
        setUser(null);
        setRole(null);
        setIsLocked(true);
        setSecurityPrincipal(null);
        return "mfa_required";
      }
      setMfaChallengeRequired(false);
      setPendingMfaProfileId(null);
    } catch (assuranceErr) {
      console.warn("Could not check authenticator assurance level:", assuranceErr);
      setError("Could not verify account security. Check your connection and sign in again.");
      setUser(null);
      setRole(null);
      setIsCloudAccount(false);
      setIsLocked(true);
      setSecurityPrincipal(null);
      return "failed";
    }

    let profileData: any = null;
    try {
      const response = await client
        .from("profiles")
        .select("*")
        .eq("id", profileId)
        .maybeSingle();
      profileData = response.data;
    } catch (err) {
      console.warn("Could not query profiles table:", err);
    }

    if (!profileData?.organization_id) {
      try {
        await client.rpc("ensure_my_profile");
        const refreshed = await client
          .from("profiles")
          .select("*")
          .eq("id", profileId)
          .maybeSingle();
        profileData = refreshed.data;
      } catch (e) {
        console.warn("Auto-provision Supabase profile RPC note:", e);
      }
    }

    // Pull metadata (Google name + avatar) from auth.users if available
    try {
      const meta = authUser?.user_metadata || {};
      const googleAvatar = meta.avatar_url || meta.picture;
      const metadataName = meta.full_name || meta.name;
      const googleName =
        typeof metadataName === "string" &&
        !isPlaceholderProfileName(metadataName, authUser?.email)
          ? metadataName.trim()
          : "";
      let needUpdate = false;
      const updates: any = {};
      if (profileData) {
        if (googleAvatar && !profileData.avatar_url) {
          updates.avatar_url = googleAvatar;
          profileData.avatar_url = googleAvatar;
          needUpdate = true;
        }
        if (googleName && isPlaceholderProfileName(profileData.full_name, profileData.email)) {
          updates.full_name = googleName;
          profileData.full_name = googleName;
          needUpdate = true;
        }
        if (needUpdate) {
          try {
            const { error: updateError } = await client
              .from("profiles")
              .update(updates)
              .eq("id", profileId);
            if (updateError) {
              console.warn("Could not sync profile metadata to Supabase:", updateError.message);
            }
          } catch {
            console.warn("Could not sync profile metadata to Supabase.");
          }
          try {
            await sqliteRepository.updateProfile({ id: profileId, ...updates });
          } catch {
            console.warn("Could not sync profile metadata to local storage.");
          }
        }
      }
    } catch (metaErr) {
      console.warn("Could not sync user metadata:", metaErr);
    }

    let organizationData: Organization | null = null;
    if (profileData?.organization_id) {
      try {
        const { data: orgData } = await client
          .from("organizations")
          .select("*")
          .eq("id", profileData.organization_id)
          .maybeSingle();
        organizationData = orgData as Organization;
      } catch (orgErr) {
        console.warn("Could not query organization:", orgErr);
      }
    }

    // Fallback: If organization was not fetched directly via Supabase query, construct safe defaults
    if (!organizationData) {
      const meta = authUser?.user_metadata || {};
      const shopName =
        meta.shop_name ||
        meta.organization_name ||
        "Shop Pro";
      const profileName = isPlaceholderProfileName(profileData?.full_name, profileData?.email)
        ? ""
        : profileData?.full_name;
      const metadataName = [meta.full_name, meta.name].find(
        (name: unknown) => typeof name === "string" && !isPlaceholderProfileName(name, authUser?.email),
      );
      const ownerName = profileName || metadataName || "Shop Owner";

      organizationData = {
        ...EMPTY_ORGANIZATION,
        id: profileData?.organization_id || crypto.randomUUID(),
        name: shopName,
        owner_name: ownerName,
        email: profileData?.email || authUser?.email,
        created_at: new Date().toISOString(),
      };
    }

    if (!profileData) {
      profileData = {
        id: profileId,
        email: authUser?.email || "",
        full_name: organizationData.owner_name,
        avatar_url: authUser?.user_metadata?.avatar_url || authUser?.user_metadata?.picture,
        role: "OWNER",
        organization_id: organizationData.id,
        is_active: true,
        created_at: new Date().toISOString(),
      };
    }

    // Cache to local SQLite so offline queries, transactions, and POS checkout always work
    let hasCachedPassword = false;
    try {
      const existingOrg = await sqliteRepository.getOrganization(organizationData.id);
      if (!existingOrg) {
        await sqliteRepository.createLocalOwnerAccount(
          organizationData,
          profileData as UserProfile,
        );
      }
      StorageEngine.ensureOrganizationDefaults(organizationData.id);

      const localAcc = await sqliteRepository.getLocalAuthAccount(profileData.id);
      await sqliteRepository.upsertLocalAuthAccount(
        organizationData.id,
        profileData.id,
        localAcc?.pin_hash || "",
        localAcc?.pin_salt || "",
      );

      const refreshedAcc = await sqliteRepository.getLocalAuthAccount(profileData.id);
      setLocalAccount(refreshedAcc);
      setHasLocalAccount(Boolean(refreshedAcc));
      setHasPinSetup(Boolean(refreshedAcc?.pin_hash));
      const cachedProfile = await sqliteRepository.getSessionProfile(profileData.id);
      hasCachedPassword = Boolean(cachedProfile?.password_hash);
    } catch (e) {
      console.warn("Could not sync local organization cache:", e);
    }

    activate(profileData as UserProfile, organizationData, true);
    setHasPasswordAccount(
      (Array.isArray(authUser?.identities) && authUser.identities.some((identity: { provider?: string }) => identity.provider === "email")) ||
        authUser?.user_metadata?.password_login_enabled === true ||
        hasCachedPassword,
    );
    return "ready";
  };
  activateSupabaseSessionRef.current = activateSupabaseSession;

  const unlock = async (enteredPin: string): Promise<boolean> => {
    if (!localAccount || enteredPin.length < MIN_PIN_LENGTH) return false;
    if (!(await verifyPin(enteredPin, localAccount.pin_hash, localAccount.pin_salt))) return false;
    const [org, profile] = await Promise.all([
      sqliteRepository.getOrganization(localAccount.organization_id),
      sqliteRepository.getSessionProfile(localAccount.profile_id),
    ]);
    if (!org || !profile || !profile.is_active) return false;
    activate(profile, org);
    return true;
  };

  const lock = () => {
    if (!hasPinSetup) return;
    setIsLocked(true);
    setSecurityPrincipal(null);
  };

  const createAccount = async (details: {
    shopName: string;
    ownerName: string;
    email: string;
    pin: string;
    confirmPin: string;
    password?: string;
  }) => {
    const shopName = details.shopName.trim();
    const ownerName = details.ownerName.trim();
    const email = details.email.trim();
    if (!shopName || !ownerName || !details.pin)
      return {
        success: false,
        error: "Shop name, owner name, and PIN are required.",
      };
    if (details.pin.length < MIN_PIN_LENGTH)
      return { success: false, error: "PIN must be at least 4 characters." };
    if (details.pin !== details.confirmPin)
      return { success: false, error: "PIN confirmation does not match." };
    const now = new Date().toISOString();
    const org: Organization = {
      ...EMPTY_ORGANIZATION,
      id: crypto.randomUUID(),
      name: shopName,
      owner_name: ownerName,
      email: email || undefined,
      created_at: now,
      updated_at: now,
    };
    const profile: UserProfile = {
      id: crypto.randomUUID(),
      email,
      full_name: ownerName,
      role: "OWNER",
      organization_id: org.id,
      is_active: true,
      created_at: now,
      ...(details.password ?
        { password_hash: await hashPassword(details.password) }
      : {}),
    };
    const credential = await hashPin(details.pin);
    try {
      await sqliteRepository.createLocalAuthAccount(
        org,
        profile,
        credential.hash,
        credential.salt,
        true,
      );
      StorageEngine.createLocalOwnerAccount(org, profile);
      const account = await sqliteRepository.getLocalAuthAccount();
      setLocalAccount(account);
      setHasLocalAccount(true);
      setHasPasswordAccount(Boolean(details.password));
      setOnboardingCompleted(true);
      activate(profile, org);
      return { success: true };
    } catch (creationError) {
      console.error("Local account creation failed:", creationError);
      return {
        success: false,
        error: getErrorMessage(
          creationError,
          "Could not create the local account.",
        ),
      };
    }
  };

  const setupPin = async (
    newPin: string,
  ): Promise<{ success: boolean; error?: string }> => {
    const pin = newPin.trim();
    if (pin.length < MIN_PIN_LENGTH) {
      return { success: false, error: "PIN must be at least 4 digits." };
    }
    const currentProfileId =
      user?.id ||
      (typeof window !== "undefined" ?
        localStorage.getItem(ACTIVE_PROFILE_KEY) || undefined
      : undefined);
    const targetOrgId =
      organization.id ||
      (await sqliteRepository.getLocalAuthAccount(currentProfileId))
        ?.organization_id;
    if (!currentProfileId || !targetOrgId) {
      return { success: false, error: "Active account session required." };
    }

    try {
      const credential = await hashPin(pin);
      await sqliteRepository.upsertLocalAuthAccount(
        targetOrgId,
        currentProfileId,
        credential.hash,
        credential.salt,
      );
      const refreshed =
        await sqliteRepository.getLocalAuthAccount(currentProfileId);
      setLocalAccount(refreshed);
      setHasLocalAccount(true);
      setHasPinSetup(true);
      setIsLocked(false);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Could not set PIN." };
    }
  };

  const updatePin = async (currentPin: string, newPin: string) => {
    if (!localAccount) {
      return setupPin(newPin);
    }
    const cleanPin = newPin.trim();
    if (cleanPin.length < MIN_PIN_LENGTH) {
      return {
        success: false,
        error: "New PIN must be at least 4 characters.",
      };
    }
    if (
      !(await verifyPin(
        currentPin.trim(),
        localAccount.pin_hash,
        localAccount.pin_salt,
      ))
    ) {
      return { success: false, error: "Current PIN is incorrect." };
    }
    const credential = await hashPin(cleanPin);
    await sqliteRepository.updateLocalAuthAccount(
      localAccount.id,
      credential.hash,
      credential.salt,
    );
    setLocalAccount({
      ...localAccount,
      pin_hash: credential.hash,
      pin_salt: credential.salt,
    });
    setHasPinSetup(true);
    return { success: true };
  };

  const updatePassword = async (
    newPassword: string,
    currentPassword?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanPass = newPassword.trim();
    if (cleanPass.length < 8) {
      return {
        success: false,
        error: "Password must be at least 8 characters.",
      };
    }

    try {
      if (isCloudAccount) {
        const client = getSupabaseClient();
        const { data: authUserData, error: authUserError } = await client.auth.getUser();
        if (authUserError || !authUserData.user) {
          return { success: false, error: authUserError?.message || "Sign in again to update your password." };
        }
        const { error: supaErr } = await client.auth.updateUser({
          password: cleanPass,
          ...(currentPassword ? { current_password: currentPassword } : {}),
          data: {
            ...(authUserData.user.user_metadata || {}),
            password_login_enabled: true,
          },
        });
        if (supaErr) {
          return { success: false, error: supaErr.message };
        }
      }
      if (user) {
        const newHash = await hashPassword(cleanPass);
        await sqliteRepository.updateProfile({
          id: user.id,
          password_hash: newHash,
        });
        setUser((prev) => (prev ? { ...prev, password_hash: newHash } : null));
        setHasPasswordAccount(true);
      }
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || "Could not update password.",
      };
    }
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: "Sign in to change your password." };
    if (!currentPassword) {
      return { success: false, error: "Enter your current password." };
    }

    try {
      if (isCloudAccount) {
        return updatePassword(newPassword, currentPassword);
      } else {
        const profile = await sqliteRepository.getSessionProfile(user.id);
        if (
          !profile?.password_hash ||
          !(await verifyPassword(currentPassword, profile.password_hash))
        ) {
          return { success: false, error: "Current password is incorrect." };
        }
      }

      return updatePassword(newPassword);
    } catch (err) {
      return {
        success: false,
        error: getErrorMessage(err, "Could not verify your current password."),
      };
    }
  };

  const updateProfilePhoto = async (
    avatarUrl: string,
  ): Promise<{ success: boolean; error?: string }> => {
    return updateProfile({ avatar_url: avatarUrl });
  };

  const updateProfile = async (updates: {
    full_name?: string;
    avatar_url?: string | null;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: "No active user session." };
    const result = await saveProfileUpdates(user, isCloudAccount, updates);
    if (!result.success) return result;
    setUser(result.user);
    setSecurityPrincipal(result.user);
    return { success: true };
  };

  const updateOrganization = (orgData: Partial<Organization>) => {
    const updated = {
      ...organization,
      ...orgData,
      updated_at: new Date().toISOString(),
    };
    void sqliteRepository.updateOrganization(updated);
    setOrganization(updated);
    if (
      user &&
      (Object.prototype.hasOwnProperty.call(orgData, "owner_name") ||
        Object.prototype.hasOwnProperty.call(orgData, "email"))
    ) {
      const updatedUser = {
        ...user,
        ...(Object.prototype.hasOwnProperty.call(orgData, "owner_name")
          ? { full_name: updated.owner_name }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(orgData, "email")
          ? { email: updated.email || user.email }
          : {}),
      };
      setUser(updatedUser);
      setSecurityPrincipal(updatedUser);
    }
  };

  const completeOnboarding = (orgData: Partial<Organization>) => {
    updateOrganization(orgData);
    setOnboardingCompleted(true);
  };

  const signIn = async (
    email: string,
    pass: string,
  ): Promise<{ error?: string }> => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !pass)
      return { error: "Please enter your email and password." };

    if (isSupabaseReady) {
      try {
        const response = await getSupabaseClient().auth.signInWithPassword({
          email: normalizedEmail,
          password: pass,
        });

        if (response.error) {
          const msg = response.error.message.toLowerCase();
          if (
            msg.includes("failed to fetch") ||
            msg.includes("network") ||
            msg.includes("timeout")
          ) {
            console.warn("Supabase unreachable during signIn, trying offline account...");
          } else if (
            msg.includes("invalid login credentials") ||
            msg.includes("invalid grant")
          ) {
            return {
              error: "Invalid email or password. Please verify your credentials.",
            };
          } else if (msg.includes("email not confirmed")) {
            let localProf =
              await sqliteRepository.findLocalProfileByEmail(normalizedEmail);
            if (!localProf) {
              const storageProf =
                StorageEngine.findLocalProfileByEmail(normalizedEmail);
              if (storageProf && storageProf.password_hash) {
                localProf = storageProf;
              }
            }
            if (
              localProf &&
              localProf.password_hash &&
              (await verifyPassword(pass, localProf.password_hash))
            ) {
              const localOrg =
                (await sqliteRepository.getOrganization(localProf.organization_id)) ||
                StorageEngine.getOrganization(localProf.organization_id);
              if (localOrg) {
                if (typeof window !== "undefined") {
                  localStorage.removeItem("yaqoob_signed_out");
                }
                const account = await sqliteRepository.getLocalAuthAccount(localProf.id);
                setLocalAccount(account);
                setHasLocalAccount(true);
                setHasPasswordAccount(true);
                setHasPinSetup(Boolean(account?.pin_hash));
                activate(localProf, localOrg);
                return {};
              }
            }
            return {
              error:
                "Your email has not been confirmed yet in Supabase. Please check your inbox for the confirmation email, or ask the admin to turn off 'Confirm email' in Supabase Dashboard (Authentication -> Providers -> Email).",
            };
          } else if (
            msg.includes("too many requests") ||
            msg.includes("rate limit")
          ) {
            return {
              error:
                "Too many sign-in attempts. Please wait a moment before trying again.",
            };
          } else {
            return { error: response.error.message };
          }
        } else if (response.data.user) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("yaqoob_signed_out");
          }
          const activated = await activateSupabaseSession(
            response.data.user.id,
          );
          if (activated === "ready" || activated === "mfa_required") return {};
          return {
            error:
              "Authentication succeeded, but failed to load workspace. Please refresh.",
          };
        }
      } catch (networkErr: any) {
        console.warn("Supabase network error during signIn:", networkErr);
      }
    }

    // Offline / Local SQLite account fallback
    let profile =
      await sqliteRepository.findLocalProfileByEmail(normalizedEmail);
    if (!profile) {
      const storageProfile =
        StorageEngine.findLocalProfileByEmail(normalizedEmail);
      if (storageProfile && storageProfile.password_hash) {
        profile = storageProfile;
      }
    }
    let account =
      profile ? await sqliteRepository.getLocalAuthAccount(profile.id) : null;
    if (
      !profile ||
      !profile.password_hash ||
      !(await verifyPassword(pass, profile.password_hash))
    ) {
      return {
        error: "Invalid email or password. Please try again.",
      };
    }
    if (!account && profile) {
      try {
        await sqliteRepository.upsertLocalAuthAccount(
          profile.organization_id,
          profile.id,
          "",
          "",
        );
        account = await sqliteRepository.getLocalAuthAccount(profile.id);
      } catch {
        console.warn("Could not restore the local authentication account.");
      }
    }
    const org =
      (await sqliteRepository.getOrganization(profile.organization_id)) ||
      StorageEngine.getOrganization(profile.organization_id);
    if (!org || !profile.is_active)
      return { error: "This account is no longer active." };

    if (typeof window !== "undefined") {
      localStorage.removeItem("yaqoob_signed_out");
    }
    setLocalAccount(account);
    setHasLocalAccount(true);
    setHasPasswordAccount(true);
    setHasPinSetup(Boolean(account?.pin_hash));
    activate(profile, org);
    return {};
  };

  const signUp = async (
    email: string,
    pass: string,
    fullName: string,
    orgName: string,
  ): Promise<{ error?: string; emailConfirmationRequired?: boolean; rateLimitExceeded?: boolean }> => {
    const normalizedEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();
    const cleanOrg = orgName.trim();

    if (!normalizedEmail || !pass || !cleanName || !cleanOrg)
      return { error: "Please complete all required fields." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return { error: "Please enter a valid email address." };
    }
    if (pass.length < 8)
      return { error: "Password must be at least 8 characters long." };

    if (isSupabaseReady) {
      try {
        const response = await getSupabaseClient().auth.signUp({
          email: normalizedEmail,
          password: pass,
          options: {
            data: {
              full_name: cleanName,
              shop_name: cleanOrg,
              organization_name: cleanOrg,
            },
          },
        });

        if (response.error) {
          const msg = response.error.message.toLowerCase();
          if (msg.includes("already") || msg.includes("exists")) {
            return {
              error: "An account with this email already exists. Please sign in instead.",
            };
          }
          if (
            msg.includes("rate limit") ||
            response.error.status === 429 ||
            (response.error as any).code === "over_email_send_rate_limit"
          ) {
            console.warn(
              "Supabase email confirmation rate limit reached during signUp. Continuing with local account creation...",
            );
            // Fall through to local account creation so the user is never blocked!
          } else {
            return {
              error: response.error.message || "Could not create your account.",
            };
          }
        } else {
          // Supabase returns an empty identities list when email already exists to prevent enumeration
          if (
            response.data.user?.identities &&
            response.data.user.identities.length === 0
          ) {
            return {
              error: "An account with this email already exists. Please sign in instead.",
            };
          }

          if (typeof window !== "undefined") {
            localStorage.removeItem("yaqoob_signed_out");
          }

          // If email confirmation is enabled on the Supabase project
          if (response.data.user && !response.data.session) {
            try {
              const now = new Date().toISOString();
              const org: Organization = {
                ...EMPTY_ORGANIZATION,
                id: crypto.randomUUID(),
                name: cleanOrg,
                owner_name: cleanName,
                email: normalizedEmail,
                created_at: now,
                updated_at: now,
              };
              const profile: UserProfile = {
                id: response.data.user.id || crypto.randomUUID(),
                email: normalizedEmail,
                full_name: cleanName,
                role: "OWNER",
                organization_id: org.id,
                is_active: true,
                password_hash: await hashPassword(pass),
                created_at: now,
              };
              await sqliteRepository.createLocalAuthAccount(org, profile, "", "", true);
              StorageEngine.createLocalOwnerAccount(org, profile);
            } catch (cacheErr) {
              console.warn("Could not pre-cache local profile during signUp:", cacheErr);
            }

            return {
              emailConfirmationRequired: true,
            };
          }

          // If user is auto-confirmed or session is immediately available
          if (response.data.session && response.data.user) {
            await activateSupabaseSession(response.data.user.id);
            setHasPinSetup(false);
            return {};
          }
        }
      } catch (networkErr: any) {
        console.warn("Supabase network error during signUp:", networkErr);
      }
    }

    // Offline / Local SQLite account fallback
    const existingSqliteProfile =
      await sqliteRepository.findLocalProfileByEmail(normalizedEmail);
    const existingStorageProfile =
      StorageEngine.findLocalProfileByEmail(normalizedEmail);
    if (
      existingSqliteProfile ||
      (existingStorageProfile && existingStorageProfile.id !== "usr-owner-1")
    ) {
      return {
        error: "An account with this email already exists. Please sign in instead.",
      };
    }

    const now = new Date().toISOString();
    const org: Organization = {
      ...EMPTY_ORGANIZATION,
      id: crypto.randomUUID(),
      name: cleanOrg,
      owner_name: cleanName,
      email: normalizedEmail,
      created_at: now,
      updated_at: now,
    };
    const profile: UserProfile = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      full_name: cleanName,
      role: "OWNER",
      organization_id: org.id,
      is_active: true,
      password_hash: await hashPassword(pass),
      created_at: now,
    };

    try {
      await sqliteRepository.createLocalAuthAccount(org, profile, "", "", true);
      StorageEngine.createLocalOwnerAccount(org, profile);
      const account = await sqliteRepository.getLocalAuthAccount(profile.id);
      if (typeof window !== "undefined") {
        localStorage.removeItem("yaqoob_signed_out");
      }
      setLocalAccount(account);
      setHasLocalAccount(true);
      setHasPasswordAccount(true);
      setHasPinSetup(false);
      setOnboardingCompleted(true);
      activate(profile, org);
      return {};
    } catch (creationError: any) {
      console.error("Local account creation error:", creationError);
      return {
        error:
          creationError?.message ||
          "Could not create the local account. Please try again.",
      };
    }
  };

  const signInWithGoogle = async (): Promise<{
    error?: string;
    authUrl?: string;
    pendingPopup?: boolean;
  }> => {
    if (!isSupabaseReady) {
      return {
        error:
          "Google sign-in requires an active Supabase cloud connection. Please configure Supabase or sign in with email and password.",
      };
    }

    const redirectUrl =
      typeof window !== "undefined" ?
        `${window.location.origin}${window.location.pathname}`
      : "";
    const isInIframe =
      typeof window !== "undefined" && window.self !== window.top;

    try {
      const response = await getSupabaseClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: isInIframe,
          queryParams: {
            access_type: "offline",
            prompt: "select_account",
          },
        },
      });

      if (response.error) {
        const msg = response.error.message.toLowerCase();
        if (
          msg.includes("provider is not enabled") ||
          msg.includes("unsupported provider")
        ) {
          return {
            error:
              "Google provider is not enabled in your Supabase project. Please enable Google in Supabase Dashboard -> Authentication -> Providers.",
          };
        }
        return {
          error: response.error.message || "Failed to initiate Google sign-in.",
        };
      }

      if (isInIframe && response.data?.url) {
        const popup = window.open(
          response.data.url,
          "google_oauth_popup",
          "width=520,height=650,left=200,top=100,menubar=no,toolbar=no,location=no,status=no",
        );
        if (!popup || popup.closed || typeof popup.closed === "undefined") {
          return {
            error:
              "Popup was blocked by your browser. Please allow popups or use the direct link below.",
            authUrl: response.data.url,
          };
        }
        return { pendingPopup: true, authUrl: response.data.url };
      }

      if (response.data?.url && !isInIframe) {
        if (typeof window !== "undefined") {
          window.location.assign(response.data.url);
        }
        return { authUrl: response.data.url };
      }

      return {};
    } catch (err: any) {
      return {
        error: err?.message || "Google sign-in could not be initiated.",
      };
    }
  };

  const resetConnectionAndSession = async () => {
    try {
      if (isSupabaseReady) {
        const { error: signOutError } = await getSupabaseClient().auth.signOut({
          scope: "local",
        });
        if (signOutError) {
          console.warn("Could not sign out from Supabase before clearing the local session.");
        }
      }
    } catch {
      console.warn("Could not sign out from Supabase before clearing the local session.");
    }
    if (typeof window !== "undefined") {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        console.warn("Could not clear browser storage before reloading.");
      }
      window.location.href = window.location.pathname;
    }
  };

  const sendPasswordReset = async (
    email: string,
  ): Promise<{ error?: string; message?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return { error: "Please enter your email address first." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { error: "Please enter a valid email address." };
    }
    if (!isSupabaseReady)
      return {
        error: "Password reset requires an active Supabase cloud connection.",
      };

    const redirectUrl = `${window.location.origin}${window.location.pathname}`;
    const response = await getSupabaseClient().auth.resetPasswordForEmail(
      cleanEmail,
      { redirectTo: redirectUrl },
    );

    if (response.error) {
      return {
        error: response.error.message || "Could not send password reset email.",
      };
    }
    return {
      message: `Password reset instructions have been sent to ${cleanEmail}. Please check your inbox.`,
    };
  };

  const completePasswordReset = async (
    newPassword: string,
  ): Promise<{ error?: string }> => {
    const cleanPass = newPassword.trim();
    if (cleanPass.length < 8) {
      return { error: "Password must be at least 8 characters long." };
    }
    try {
      const { error: supaErr } = await getSupabaseClient().auth.updateUser({
        password: cleanPass,
      });
      if (supaErr) {
        return { error: supaErr.message };
      }
      setIsPasswordRecovery(false);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", window.location.pathname);
      }
      return {};
    } catch (e: any) {
      return {
        error: e?.message || "Failed to update password. Please try again.",
      };
    }
  };

  const cancelPasswordReset = () => {
    setIsPasswordRecovery(false);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  };

  const signOut = async () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("yaqoob_signed_out", "true");
      localStorage.removeItem(ACTIVE_PROFILE_KEY);
    }
    if (isSupabaseReady)
      await getSupabaseClient()
        .auth.signOut()
        .catch(() => {});
    setUser(null);
    setRole(null);
    setLocalAccount(null);
    setHasLocalAccount(false);
    setHasPasswordAccount(false);
    setIsCloudAccount(false);
    setHasPinSetup(false);
    setMfaChallengeRequired(false);
    setPendingMfaProfileId(null);
    setOrganization(EMPTY_ORGANIZATION);
    setSecurityPrincipal(null);
    setIsLocked(true);
  };

  const verifyMfaChallenge = async (code: string): Promise<{ success: boolean; error?: string }> => {
    const cleanCode = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(cleanCode)) {
      return { success: false, error: "Enter the 6-digit code from your authenticator app." };
    }
    if (!pendingMfaProfileId) {
      return { success: false, error: "Your sign-in session expired. Sign in again." };
    }
    try {
      const client = getSupabaseClient();
      const { data: factors, error: factorsError } = await client.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      const factor = factors.totp.find((item) => item.status === "verified");
      if (!factor) throw new Error("No verified authenticator app is linked to this account.");
      const { error: verifyError } = await client.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: cleanCode,
      });
      if (verifyError) throw verifyError;
      const profileId = pendingMfaProfileId;
      const status = await activateSupabaseSession(profileId);
      if (status !== "ready") throw new Error("The second factor was accepted, but the workspace could not be loaded. Refresh and try again.");
      return { success: true };
    } catch (err) {
      return { success: false, error: getErrorMessage(err, "Could not verify the authenticator code.") };
    }
  };

  const cancelMfaChallenge = signOut;

  const enterDemoMode = async () => {
    setIsLoading(true);
    try {
      const { organization: demoOrg, profile: demoProfile } = await setupDemoWorkspace();
      setIsDemoMode(true);
      activate(demoProfile, demoOrg);
      setHasLocalAccount(true);
      setHasPasswordAccount(true);
      setHasPinSetup(false);
      setIsLocked(false);
      if (typeof window !== "undefined") {
        localStorage.setItem("yaqoob_demo_mode", "true");
        localStorage.removeItem("yaqoob_signed_out");
      }
    } catch (err) {
      console.error("Failed to enter demo mode:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const exitDemoMode = async () => {
    setIsLoading(true);
    try {
      await cleanupDemoWorkspace();
      setIsDemoMode(false);
      await signOut();
    } catch (err) {
      console.error("Failed to exit demo mode:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        role,
        isSupabaseReady,
        isCloudAccount,
        isLoading,
        isLocked,
        hasLocalAccount,
        hasPasswordAccount,
        hasPinSetup,
        isPasswordRecovery,
        unlock,
        lock,
        setupPin,
        updatePin,
        updatePassword,
        changePassword,
        updateProfilePhoto,
        updateProfile,
        mfaChallengeRequired,
        verifyMfaChallenge,
        cancelMfaChallenge,
        createAccount,
        onboardingCompleted,
        signIn,
        signUp,
        signInWithGoogle,
        sendPasswordReset,
        completePasswordReset,
        cancelPasswordReset,
        resetConnectionAndSession,
        signOut,
        updateOrganization,
        completeOnboarding,
        isDemoMode,
        enterDemoMode,
        exitDemoMode,
        error,
        clearError: () => setError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
