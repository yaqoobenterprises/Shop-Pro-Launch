import React, { useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

export const MfaChallengeScreen: React.FC = () => {
  const { verifyMfaChallenge, cancelMfaChallenge } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsVerifying(true);
    const result = await verifyMfaChallenge(code);
    if (!result.success) setError(result.error || "That code could not be verified.");
    setIsVerifying(false);
  };

  return (
    <main className="auth-screen flex min-h-dvh items-center justify-center bg-surface px-4 py-10 font-sans text-on-surface">
      <section className="auth-card workspace-panel w-full max-w-md p-6 sm:p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/[0.08] text-primary"><ShieldCheck className="h-6 w-6" /></div>
        <div className="text-center">
          <h1 className="text-xl font-bold tracking-tight text-on-surface">Verify your account</h1>
          <p className="mt-2 text-sm text-text-muted">Enter the current 6-digit code from your authenticator app to continue.</p>
        </div>
        {error && <p role="alert" className="mt-5 rounded-lg border border-danger-border bg-danger-bg p-3 text-xs text-danger">{error}</p>}
        <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
          <label className="settings-field block"><span>Authenticator code</span><input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" maxLength={8} autoFocus value={code} onChange={(event) => setCode(event.target.value.replace(/[^0-9 ]/g, ""))} placeholder="000000" className="text-center font-mono text-xl tracking-[0.4em]" /></label>
          <button type="submit" disabled={isVerifying} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"><LockKeyhole className="h-4 w-4" />{isVerifying ? "Verifying…" : "Verify and continue"}</button>
          <button type="button" onClick={() => void cancelMfaChallenge()} className="min-h-10 w-full rounded-lg px-3 text-xs font-semibold text-secondary hover:bg-surface-container-low">Cancel and sign out</button>
        </form>
      </section>
    </main>
  );
};
