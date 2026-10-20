import React, { useEffect, useState } from "react";
import { Check, KeyRound, QrCode, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { getSupabaseClient, isSupabaseConfigured } from "../../lib/supabase";

type TotpFactor = { id: string; friendly_name?: string | null; status: string };
type PendingTotp = { id: string; qrCode: string; secret: string; uri: string };

export const SecuritySettingsSection: React.FC = () => {
  const { user, hasPasswordAccount, isCloudAccount, changePassword, updatePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [pendingTotp, setPendingTotp] = useState<PendingTotp | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [isLoadingFactors, setIsLoadingFactors] = useState(false);
  const [isWorkingOnMfa, setIsWorkingOnMfa] = useState(false);
  const [mfaMessage, setMfaMessage] = useState<string | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);

  const refreshFactors = async () => {
    if (!isSupabaseConfigured()) return;
    setIsLoadingFactors(true);
    try {
      const { data, error } = await getSupabaseClient().auth.mfa.listFactors();
      if (error) throw error;
      setFactors(data.all.filter((factor) => factor.factor_type === "totp").map(({ id, friendly_name, status }) => ({ id, friendly_name, status })));
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : "Could not load authenticator settings.");
    } finally {
      setIsLoadingFactors(false);
    }
  };

  useEffect(() => {
    if (user?.id && isCloudAccount) void refreshFactors();
  }, [user?.id, isCloudAccount]);

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError("Use at least 8 characters for your password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The new passwords do not match.");
      return;
    }
    setIsChangingPassword(true);
    try {
      const result = hasPasswordAccount
        ? await changePassword(currentPassword, newPassword)
        : await updatePassword(newPassword);
      if (!result.success) throw new Error(result.error || "Could not update your password.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password updated.");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Could not update your password.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const startEnrollment = async () => {
    setMfaError(null);
    setMfaMessage(null);
    setIsWorkingOnMfa(true);
    try {
      const client = getSupabaseClient();
      const { data: existing, error: listError } = await client.auth.mfa.listFactors();
      if (listError) throw listError;
      for (const factor of existing.all.filter((item) => item.factor_type === "totp" && item.status === "unverified")) {
        const { error: removeError } = await client.auth.mfa.unenroll({ factorId: factor.id });
        if (removeError) throw removeError;
      }
      const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app" });
      if (error) throw error;
      setPendingTotp({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri });
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : "Could not start authenticator setup.");
    } finally {
      setIsWorkingOnMfa(false);
    }
  };

  const verifyEnrollment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingTotp) return;
    setMfaError(null);
    setMfaMessage(null);
    setIsWorkingOnMfa(true);
    try {
      const client = getSupabaseClient();
      const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId: pendingTotp.id });
      if (challengeError) throw challengeError;
      const { error } = await client.auth.mfa.verify({ factorId: pendingTotp.id, challengeId: challenge.id, code: totpCode.replace(/\s/g, "") });
      if (error) throw error;
      setPendingTotp(null);
      setTotpCode("");
      setMfaMessage("Authenticator app enabled. You will be asked for a code on your next sign-in.");
      await refreshFactors();
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : "That code could not be verified. Try the current code from your app.");
    } finally {
      setIsWorkingOnMfa(false);
    }
  };

  const cancelEnrollment = async () => {
    if (!pendingTotp) return;
    setMfaError(null);
    setIsWorkingOnMfa(true);
    try {
      const { error } = await getSupabaseClient().auth.mfa.unenroll({ factorId: pendingTotp.id });
      if (error) throw error;
      setPendingTotp(null);
      setTotpCode("");
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : "Could not cancel authenticator setup.");
    } finally {
      setIsWorkingOnMfa(false);
    }
  };

  const removeFactor = async (factorId: string) => {
    if (!window.confirm("Turn off authenticator sign-in for this account?")) return;
    setMfaError(null);
    setMfaMessage(null);
    setIsWorkingOnMfa(true);
    try {
      const { error } = await getSupabaseClient().auth.mfa.unenroll({ factorId });
      if (error) throw error;
      setMfaMessage("Authenticator app removed.");
      await refreshFactors();
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : "Could not remove the authenticator app.");
    } finally {
      setIsWorkingOnMfa(false);
    }
  };

  const verifiedFactor = factors.find((factor) => factor.status === "verified");
  const unverifiedFactors = factors.filter((factor) => factor.status !== "verified");

  return (
    <section id="security" className="workspace-panel settings-section space-y-7 p-5">
      <div className="flex items-start gap-3">
        <div className="settings-icon"><ShieldCheck className="h-4 w-4" /></div>
        <div>
          <h2 className="text-sm font-semibold text-on-surface">Security</h2>
          <p className="mt-0.5 text-xs text-text-muted">Password and two-step verification.</p>
        </div>
      </div>

      <div className="border-t border-border-standard pt-5">
        <div className="mb-3 flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /><h3 className="text-xs font-semibold text-on-surface">Password</h3></div>
        {passwordError && <p role="alert" className="mb-3 rounded-lg border border-danger-border bg-danger-bg p-3 text-xs text-danger">{passwordError}</p>}
        {passwordMessage && <p role="status" className="mb-3 flex items-center gap-2 rounded-lg border border-success-border bg-success-bg p-3 text-xs text-success"><Check className="h-4 w-4" />{passwordMessage}</p>}
        <form onSubmit={(event) => void handlePasswordChange(event)} className="grid gap-3 sm:max-w-xl sm:grid-cols-2">
          {hasPasswordAccount && <label className="settings-field sm:col-span-2"><span>Current password</span><input required autoComplete="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>}
          {isCloudAccount && !hasPasswordAccount && <p className="sm:col-span-2 text-xs text-text-muted">This account uses Google sign-in. Set a password here if you also want email and password sign-in.</p>}
          <label className="settings-field"><span>{hasPasswordAccount ? "New password" : "Password"}</span><input required minLength={8} autoComplete="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          <label className="settings-field"><span>Confirm password</span><input required minLength={8} autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
          <button type="submit" disabled={isChangingPassword} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-primary-hover disabled:opacity-60">{isChangingPassword ? "Updating…" : hasPasswordAccount ? "Change password" : "Set password"}</button>
        </form>
      </div>

      <div className="border-t border-border-standard pt-5">
        <div className="mb-3 flex items-center gap-2"><Smartphone className="h-4 w-4 text-primary" /><h3 className="text-xs font-semibold text-on-surface">Authenticator app</h3></div>
        <p className="mb-4 max-w-2xl text-xs text-text-muted">Use an authenticator app for a verification code at sign-in.</p>
        {mfaError && <p role="alert" className="mb-3 rounded-lg border border-danger-border bg-danger-bg p-3 text-xs text-danger">{mfaError}</p>}
        {mfaMessage && <p role="status" className="mb-3 rounded-lg border border-success-border bg-success-bg p-3 text-xs text-success">{mfaMessage}</p>}
        {!isCloudAccount ? <p className="text-xs text-text-muted">Authenticator sign-in is available after signing in to a cloud account.</p> : verifiedFactor ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success-border bg-success-bg/50 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-success"><Check className="h-4 w-4" />Authenticator app is enabled</div>
            <button type="button" onClick={() => void removeFactor(verifiedFactor.id)} disabled={isWorkingOnMfa} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border-standard bg-surface-bright px-3 text-xs font-semibold text-secondary hover:text-danger disabled:opacity-60"><Trash2 className="h-3.5 w-3.5" />Turn off</button>
          </div>
        ) : pendingTotp ? (
          <div className="grid gap-4 rounded-xl border border-border-standard bg-surface-container-low p-4 sm:grid-cols-[180px_1fr]">
            <div className="flex h-44 w-44 items-center justify-center rounded-lg bg-white p-2">
              <img alt="Authenticator setup QR code" className="h-full w-full" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(pendingTotp.qrCode)}`} />
            </div>
            <div className="space-y-3">
              <p className="text-xs text-secondary">Scan this QR code with your authenticator app. If scanning is unavailable, enter this setup key manually:</p>
              <code className="block break-all rounded-lg border border-border-standard bg-surface-bright p-3 font-mono text-xs text-on-surface">{pendingTotp.secret}</code>
              <form onSubmit={(event) => void verifyEnrollment(event)} className="flex flex-wrap gap-2">
                <input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" maxLength={8} aria-label="Authenticator code" placeholder="6-digit code" value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/[^0-9 ]/g, ""))} className="workspace-control min-h-10 w-36 px-3 font-mono text-sm tracking-widest" />
                <button type="submit" disabled={isWorkingOnMfa} className="min-h-10 rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60">{isWorkingOnMfa ? "Verifying…" : "Verify and enable"}</button>
                <button type="button" onClick={() => void cancelEnrollment()} disabled={isWorkingOnMfa} className="min-h-10 rounded-lg border border-border-standard px-3 text-xs font-semibold text-secondary hover:bg-surface-bright disabled:opacity-60">Cancel</button>
              </form>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {unverifiedFactors.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">Authenticator setup is not verified yet. Start again to get a fresh QR code.</p>}
            <button type="button" onClick={() => void startEnrollment()} disabled={isWorkingOnMfa || isLoadingFactors} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-primary-hover disabled:opacity-60"><QrCode className="h-4 w-4" />{isWorkingOnMfa ? "Preparing…" : "Set up authenticator app"}</button>
          </div>
        )}
      </div>
    </section>
  );
};
