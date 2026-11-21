import React, { useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { AuthFrame } from "./AuthFrame";

/** Presentational challenge only. Factor selection, membership and session assurance remain server-owned. */
export const MfaChallengeScreen: React.FC = () => {
  const { verifyMfaChallenge, cancelMfaChallenge } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isVerifying) return;
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setError(null);
    setIsVerifying(true);
    try {
      const result = await verifyMfaChallenge(code);
      if (!result.success) {
        setError(result.error || "That code could not be verified.");
      }
    } catch {
      setError("Verification could not be completed. Try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <AuthFrame>
      <main className="auth-card aq-auth__card">
        <div className="aq-auth__heading">
          <span className="aq-auth__security-icon"><ShieldCheck size={21} aria-hidden="true" /></span>
          <h1>Verify your account</h1>
          <p>Enter your current authenticator code to continue securely.</p>
        </div>
        <form onSubmit={(event) => void submit(event)} noValidate>
          <div className="aq-auth__field">
            <label className="aq-auth__field-label" htmlFor="aq-mfa-code">6-digit authenticator code</label>
            <input
              id="aq-mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              type="text"
              maxLength={6}
              pattern="[0-9]{6}"
              autoFocus
              required
              value={code}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "aq-mfa-error" : "aq-mfa-hint"}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                setError(null);
              }}
              placeholder="000000"
              className="aq-auth__code-input"
            />
            {!error && <p id="aq-mfa-hint" className="aq-auth__field-note">Open your authenticator app and enter the latest code.</p>}
          </div>
          {error && <p id="aq-mfa-error" role="alert" className="aq-auth__feedback" data-tone="error">{error}</p>}
          <button type="submit" className="aq-auth__submit" aria-busy={isVerifying} disabled={isVerifying || code.length !== 6}>
            <LockKeyhole size={17} aria-hidden="true" />
            {isVerifying ? "Verifying…" : "Verify and continue"}
          </button>
          <button type="button" disabled={isVerifying}
            onClick={() => void cancelMfaChallenge()} className="aq-auth__cancel">
            Cancel and sign out
          </button>
        </form>
      </main>
    </AuthFrame>
  );
};
