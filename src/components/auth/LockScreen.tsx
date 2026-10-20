import React, { useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { UserAvatar } from "../common/UserAvatar";
import { getProfileDisplayName } from "../../lib/profileDisplay";
import { useI18n } from "../../i18n";

const fieldClass =
  "w-full h-11 rounded-lg border border-border-standard bg-surface-bright px-3.5 text-sm outline-none transition placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/15";

/**
 * Global Production-Grade Unified Auth Screen
 * - Clean Email/Password with Sign In <-> Sign Up toggle
 * - Google Single Sign-On with popup & iframe compatibility
 * - Password recovery flow & confirmation notice
 * - Zero technical jargon, professional error handling
 */
export interface AuthScreenProps {
  initialMode?: "signIn" | "signUp" | "forgotPassword";
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  initialMode = "signIn",
}) => {
  const {
    signIn,
    signUp,
    signInWithGoogle,
    sendPasswordReset,
    completePasswordReset,
    cancelPasswordReset,
    resetConnectionAndSession,
    isPasswordRecovery,
    error: authError,
    clearError,
  } = useAuth();
  const { t } = useI18n();

  const [mode, setMode] = useState<"signIn" | "signUp" | "forgotPassword">(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "error" | "success" | "info";
    text: string;
    authUrl?: string;
    isRateLimit?: boolean;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [emailConfirmationSent, setEmailConfirmationSent] = useState<string | null>(null);

  // Recovery password inputs
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState("");

  const [form, setForm] = useState({
    fullName: "",
    shopName: "",
    email: "",
    password: "",
  });

  useEffect(() => {
    if (authError) {
      setFeedback({
        type: "error",
        text: authError,
      });
      clearError();
    }
  }, [authError, clearError]);

  useEffect(() => {
    // Detect OAuth errors or callback tokens passed back in URL hash or query params
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const rawParams =
      hash.startsWith("#") ? hash.slice(1)
      : search.startsWith("?") ? search.slice(1)
      : "";

    if (rawParams) {
      const params = new URLSearchParams(rawParams);
      const errorCode = params.get("error_code") || params.get("error");
      const errorDesc = params.get("error_description");

      if (errorCode || errorDesc) {
        if (
          errorCode === "403" ||
          errorCode === "access_denied" ||
          errorDesc?.toLowerCase().includes("access_denied")
        ) {
          setFeedback({
            type: "error",
            text: "Google Sign-In Access Denied (403): The OAuth consent screen is configured in 'Testing' mode. To sign in with this Google account, add your email to 'Test Users' in your Google Cloud Console OAuth consent screen, or publish the application to Production.",
          });
        } else if (
          errorDesc?.toLowerCase().includes("redirect_uri_mismatch") ||
          errorCode === "redirect_uri_mismatch"
        ) {
          setFeedback({
            type: "error",
            text: "Google Sign-In configuration mismatch: The current application URL is not listed as an Authorized Redirect URI in your Google Cloud Console OAuth Client credentials.",
          });
        } else {
          setFeedback({
            type: "error",
            text:
              errorDesc ?
                decodeURIComponent(errorDesc.replace(/\+/g, " "))
              : "Authentication error occurred while connecting with Google.",
          });
        }
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, []);

  const update = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFeedback(null);
  };

  const handlePasswordRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (recoveryPassword.length < 8) {
      setFeedback({
        type: "error",
        text: "New password must be at least 8 characters long.",
      });
      return;
    }
    if (recoveryPassword !== recoveryConfirmPassword) {
      setFeedback({
        type: "error",
        text: "New passwords do not match. Please verify.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await completePasswordReset(recoveryPassword);
      if (res.error) {
        setFeedback({ type: "error", text: res.error });
      } else {
        setFeedback({
          type: "success",
          text: "Your password has been successfully updated! Entering your shop...",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        text: "Unable to update password. Please request a new reset link.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);

    try {
      if (mode === "signIn") {
        const result = await signIn(form.email, form.password);
        if (result.error) {
          setFeedback({ type: "error", text: result.error });
        }
      } else if (mode === "signUp") {
        if (!form.fullName.trim()) {
          setFeedback({ type: "error", text: "Please enter your name." });
          setIsSubmitting(false);
          return;
        }
        if (!form.shopName.trim()) {
          setFeedback({
            type: "error",
            text: "Please enter your business or shop name.",
          });
          setIsSubmitting(false);
          return;
        }
        if (form.password.length < 8) {
          setFeedback({
            type: "error",
            text: "Password must be at least 8 characters long.",
          });
          setIsSubmitting(false);
          return;
        }
        const result = await signUp(
          form.email,
          form.password,
          form.fullName,
          form.shopName,
        );

        if (result.error) {
          setFeedback({
            type: "error",
            text: result.error,
            isRateLimit: result.rateLimitExceeded,
          });
        } else if (result.emailConfirmationRequired) {
          setEmailConfirmationSent(form.email.trim());
        }
      } else if (mode === "forgotPassword") {
        if (!form.email.trim()) {
          setFeedback({
            type: "error",
            text: "Please enter your email address to receive reset instructions.",
          });
          setIsSubmitting(false);
          return;
        }
        const result = await sendPasswordReset(form.email);
        if (result.error) {
          setFeedback({ type: "error", text: result.error });
        } else {
          setFeedback({
            type: "success",
            text:
              result.message ||
              "Password reset instructions have been sent to your email. Please check your inbox.",
          });
        }
      }
    } catch {
      setFeedback({
        type: "error",
        text: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setFeedback(null);
    setIsGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result.error) {
        setFeedback({
          type: "error",
          text: result.error,
          authUrl: result.authUrl,
        });
        setIsGoogleLoading(false);
      } else if (result.pendingPopup && result.authUrl) {
        setFeedback({
          type: "info",
          text: "Google Sign-In window is open. Please choose your account to continue.",
          authUrl: result.authUrl,
        });
      } else if (result.authUrl) {
        setFeedback({
          type: "info",
          text: "Redirecting to Google Sign-In...",
          authUrl: result.authUrl,
        });
      }
    } catch {
      setFeedback({
        type: "error",
        text: "Google sign-in could not be initiated.",
      });
      setIsGoogleLoading(false);
    }
  };

  // If currently in Supabase Password Recovery Flow
  if (isPasswordRecovery) {
    return (
      <div className="auth-screen flex min-h-dvh w-full items-center justify-center bg-surface p-4 font-sans text-on-surface">
        <main className="auth-card w-full max-w-[400px] rounded-xl border border-border-standard bg-surface-bright p-6 shadow-level-2 sm:p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <KeyRound className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold text-on-surface">{t("auth.setPassword")}</h1>
            <p className="mt-1 text-xs text-text-muted">
              {t("auth.chooseStrongPassword")}
            </p>
          </div>

          <form onSubmit={handlePasswordRecoverySubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-secondary">
                {t("auth.newPassword")}
              </label>
              <div className="relative">
                <input
                  required
                  minLength={8}
                  type={showPassword ? "text" : "password"}
                  placeholder={t("auth.passwordMinimum")}
                  className={`${fieldClass} pr-10`}
                  value={recoveryPassword}
                  onChange={(e) => {
                    setRecoveryPassword(e.target.value);
                    setFeedback(null);
                  }}
                  autoComplete="new-password"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="auth-password-toggle absolute right-1 top-1 text-text-muted hover:text-on-surface transition cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ?
                    <EyeOff className="h-4.5 w-4.5" />
                  : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-secondary">
                {t("auth.confirmNewPassword")}
              </label>
              <div className="relative">
                <input
                  required
                  minLength={8}
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder={t("auth.reenterPassword")}
                  className={`${fieldClass} pr-10`}
                  value={recoveryConfirmPassword}
                  onChange={(e) => {
                    setRecoveryConfirmPassword(e.target.value);
                    setFeedback(null);
                  }}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="auth-password-toggle absolute right-1 top-1 text-text-muted hover:text-on-surface transition cursor-pointer"
                  aria-label={
                    showConfirmPassword ? "Hide password" : "Show password"
                  }
                >
                  {showConfirmPassword ?
                    <EyeOff className="h-4.5 w-4.5" />
                  : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
            </div>

            {feedback && (
              <div
                className={`p-3 rounded-lg text-xs leading-relaxed flex items-start gap-2 ${
                  feedback.type === "error" ?
                    "bg-danger-bg border border-danger-border text-danger"
                  : "bg-success-bg border border-success-border text-success"
                }`}
              >
                {feedback.type === "error" ?
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                : <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />}
                <span>{feedback.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary bg-primary text-sm font-semibold text-white shadow-xs transition-colors hover:bg-primary-hover disabled:opacity-60 cursor-pointer"
            >
              {isSubmitting ?
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t("auth.updatingPassword")}</span>
                </>
              : <>
                  <span>{t("auth.savePasswordOpenShop")}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              }
            </button>

            <button
              type="button"
              onClick={cancelPasswordReset}
              className="min-h-11 w-full pt-2 text-center text-xs font-medium text-text-muted hover:text-on-surface hover:underline cursor-pointer"
            >
              {t("auth.cancelBack")}
            </button>
          </form>
        </main>
      </div>
    );
  }

  // If email confirmation has been sent
  if (emailConfirmationSent) {
    return (
      <div className="auth-screen flex min-h-dvh w-full items-center justify-center bg-surface p-4 font-sans text-on-surface">
        <main className="auth-card w-full max-w-[420px] rounded-xl border border-border-standard bg-surface-bright p-6 shadow-level-2 sm:p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg text-success ring-8 ring-success-bg/50">
            <Mail className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-on-surface">{t("auth.checkEmail")}</h1>
          <p className="mt-2 text-xs leading-relaxed text-text-muted">
            {t("auth.verificationSent")}{" "}
            <span className="font-semibold text-on-surface">
              {emailConfirmationSent}
            </span>
            .
          </p>
          <div className="my-5 rounded-lg border border-border-standard bg-surface p-3.5 text-left text-xs leading-relaxed text-secondary">
            <p className="font-semibold text-on-surface mb-1">{t("auth.nextSteps")}</p>
            <ol className="list-decimal pl-4 space-y-1 text-text-muted">
              <li>{t("auth.openInbox")}</li>
              <li>{t("auth.confirmEmail")}</li>
              <li>{t("auth.returnSignIn")}</li>
            </ol>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (emailConfirmationSent && form.password) {
                const res = await signIn(emailConfirmationSent, form.password);
                if (!res.error) {
                  setEmailConfirmationSent(null);
                  return;
                }
              }
              setEmailConfirmationSent(null);
              setMode("signIn");
              setFeedback({
                type: "info",
                text: t("auth.enterPasswordToSignIn"),
              });
            }}
            className="mb-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary bg-primary text-sm font-semibold text-white shadow-xs transition hover:bg-primary-hover cursor-pointer"
          >
            <span>{t("auth.openLocalShop")}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setEmailConfirmationSent(null);
              setMode("signIn");
              setFeedback({
                type: "info",
                text: t("auth.confirmThenSignIn"),
              });
            }}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border-standard bg-surface text-xs font-semibold text-on-surface hover:bg-surface-bright transition cursor-pointer"
          >
            <span>{t("auth.backToSignInScreen")}</span>
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-screen flex min-h-dvh w-full items-center justify-center bg-surface p-4 font-sans text-on-surface">
      <main className="auth-card w-full max-w-[420px] rounded-xl border border-border-standard bg-surface-bright p-6 shadow-level-2 sm:p-8">
        {/* Header Branding */}
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src="/assets/logo.svg"
            alt="Shop Pro"
            className="mb-2 h-10 w-10 rounded-lg shadow-xs"
          />
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
            Shop Pro Cashbook
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-on-surface">
            {mode === "signIn" ?
              "Welcome back"
            : mode === "signUp" ?
              "Create your account"
            : "Reset your password"}
          </h1>
          <p className="mt-1 max-w-[300px] text-xs text-text-muted">
            {mode === "signIn" ?
              "Sign in to access your shop ledger and accounts."
            : mode === "signUp" ?
              "Set up your shop and start recording transactions."
            : "Enter your registered email to receive reset instructions"}
          </p>
        </div>

        {/* Mode Selector Tabs (Sign In / Sign Up) */}
        {mode !== "forgotPassword" && (
          <div className="auth-mode-tabs mb-5 grid grid-cols-2 gap-1 rounded-lg border border-border-standard bg-surface p-1">
            <button
              type="button"
              onClick={() => {
                setMode("signIn");
                setFeedback(null);
              }}
              className={`auth-mode-tab flex h-11 items-center justify-center rounded-md text-xs font-semibold transition cursor-pointer ${
                mode === "signIn" ?
                  "bg-surface-bright text-on-surface shadow-xs"
                : "text-text-muted hover:text-on-surface"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signUp");
                setFeedback(null);
              }}
              className={`auth-mode-tab flex h-11 items-center justify-center rounded-md text-xs font-semibold transition cursor-pointer ${
                mode === "signUp" ?
                  "bg-surface-bright text-on-surface shadow-xs"
                : "text-text-muted hover:text-on-surface"
              }`}
            >
              Create account
            </button>
          </div>
        )}

        {/* Google Single Sign-On Button */}
        {mode !== "forgotPassword" && (
          <>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSubmitting || isGoogleLoading}
              className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-border-standard bg-surface-bright text-sm font-semibold text-on-surface shadow-xs transition hover:border-outline-variant hover:bg-surface disabled:opacity-60 cursor-pointer"
            >
              {isGoogleLoading ?
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-xs">{t("auth.connectingGoogle")}</span>
                </>
              : <>
                  <svg className="h-4.5 w-4.5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>{t("auth.continueGoogle")}</span>
                </>
              }
            </button>

            {/* Clean Divider */}
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border-standard" />
              </div>
              <div className="relative flex justify-center text-[11px] font-medium uppercase tracking-wider text-text-muted">
                <span className="bg-surface-bright px-2.5">{t("auth.orEmail")}</span>
              </div>
            </div>
          </>
        )}

        {/* Email & Password Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === "signUp" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-secondary">
                  Your Full Name
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Muhammad Yaqoob"
                  className={fieldClass}
                  value={form.fullName}
                  onChange={(e) => update("fullName", e.target.value)}
                  autoComplete="name"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-secondary">
                  Shop / Business Name
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Yaqoob Enterprises & Printing"
                  className={fieldClass}
                  value={form.shopName}
                  onChange={(e) => update("shopName", e.target.value)}
                  autoComplete="organization"
                />
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-secondary">
              Email Address
            </label>
            <input
              required
              type="email"
              placeholder="name@business.com"
              className={fieldClass}
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              autoComplete="email"
            />
          </div>

          {mode !== "forgotPassword" && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-semibold text-secondary">
                  Password
                </label>
                {mode === "signIn" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgotPassword");
                      setFeedback(null);
                    }}
                    className="auth-inline-action min-h-11 px-1 text-xs font-medium text-primary hover:text-primary-hover hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  required
                  minLength={8}
                  type={showPassword ? "text" : "password"}
                  placeholder={
                    mode === "signUp" ? "Minimum 8 characters" : "••••••••"
                  }
                  className={`${fieldClass} pr-10`}
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  autoComplete={
                    mode === "signIn" ? "current-password" : "new-password"
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="auth-password-toggle absolute right-1 top-1 text-text-muted hover:text-on-surface transition cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ?
                    <EyeOff className="h-4.5 w-4.5" />
                  : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
              {mode === "signUp" && (
                <p className="mt-1 text-[11px] text-text-muted">
                  Use at least 8 characters with letters and numbers.
                </p>
              )}
            </div>
          )}

          {feedback && (
            <div
              className={`p-3 rounded-lg text-xs leading-relaxed flex flex-col gap-2 ${
                feedback.type === "error" ?
                  "bg-danger-bg border border-danger-border text-danger"
                : feedback.type === "success" ?
                  "bg-success-bg border border-success-border text-success"
                : "bg-primary/5 border border-primary/20 text-primary"
              }`}
            >
              <div className="flex items-start gap-2">
                {feedback.type === "error" ?
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                : feedback.type === "info" && isGoogleLoading ?
                  <Loader2 className="h-4 w-4 shrink-0 mt-0.5 animate-spin text-primary" />
                : <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />}
                <span>{feedback.text}</span>
              </div>

              {feedback.authUrl && (
                <div className="mt-1 flex items-center gap-3 font-semibold">
                  <a
                    href={feedback.authUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="auth-inline-action min-h-10 gap-1 underline text-primary hover:text-primary-hover cursor-pointer"
                  >
                    <span>{t("auth.openGoogleSignIn")}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  {isGoogleLoading && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsGoogleLoading(false);
                        setFeedback(null);
                      }}
                      className="auth-inline-action min-h-10 text-text-muted hover:text-on-surface hover:underline cursor-pointer font-normal"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}

              {feedback.isRateLimit && (
                <div className="mt-1 flex flex-col gap-2 pt-2 border-t border-danger-border/60">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-surface-bright border border-border-standard text-xs font-semibold text-on-surface hover:bg-surface transition cursor-pointer"
                  >
                    <span>{t("auth.googleInstant")}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || isGoogleLoading}
            className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary bg-primary text-sm font-semibold text-white shadow-xs transition-colors hover:bg-primary-hover disabled:opacity-60 cursor-pointer"
          >
            {isSubmitting ?
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {mode === "signIn" ? "Signing in..."
                  : mode === "signUp" ? "Creating account..."
                  : "Sending reset link..."}
                </span>
              </>
            : <>
                <span>
                  {mode === "signIn" ? "Sign in"
                  : mode === "signUp" ? "Create account"
                  : "Send reset link"}
                </span>
                <ArrowRight className="h-4 w-4" />
              </>
            }
          </button>
        </form>

        {/* Footer Navigation */}
        <div className="mt-6 pt-5 border-t border-border-standard text-center text-xs text-text-muted">
          {mode === "forgotPassword" ?
            <button
              type="button"
              onClick={() => {
                setMode("signIn");
                setFeedback(null);
              }}
              className="auth-inline-action min-h-11 gap-1.5 px-1 font-semibold text-primary hover:underline cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{t("auth.backToSignIn")}</span>
            </button>
          : mode === "signIn" ?
            <p>
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signUp");
                  setFeedback(null);
                }}
                className="auth-inline-action min-h-11 px-1 font-semibold text-primary hover:underline cursor-pointer"
              >
                Create one now
              </button>
            </p>
          : <p>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signIn");
                  setFeedback(null);
                }}
                className="auth-inline-action min-h-11 px-1 font-semibold text-primary hover:underline cursor-pointer"
              >
                Sign in instead
              </button>
            </p>
          }

          <div className="mt-4 pt-3 border-t border-border-standard/60 text-center">
            <button
              type="button"
              onClick={async () => {
                setIsSubmitting(true);
                setFeedback({
                  type: "info",
                  text: "Clearing stale credentials and resetting connection...",
                });
                await resetConnectionAndSession();
              }}
              className="auth-inline-action min-h-10 px-1 text-[11px] text-text-muted hover:text-primary transition underline cursor-pointer"
            >
              Reset connection & clear cached session
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

/**
 * 4-Digit PIN Setup Screen
 * Shown right after account creation or initial Google sign-in.
 * Establishes the quick-unlock PIN used for the register lock screen.
 */
export const PinSetupScreen: React.FC = () => {
  const { setupPin, signOut } = useAuth();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    document.getElementById("setup-pin-input")?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setError("PIN must be exactly 4 digits.");
      return;
    }
    if (pin !== confirmPin) {
      setError("PIN and confirmation do not match.");
      return;
    }

    setIsSubmitting(true);
    const result = await setupPin(pin);
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error || "Failed to set up PIN. Please try again.");
    }
  };

  return (
    <div className="auth-screen flex min-h-dvh w-full items-center justify-center bg-surface p-4 font-sans text-on-surface">
      <main className="auth-card w-full max-w-[400px] rounded-xl border border-border-standard bg-surface-bright p-6 shadow-level-2 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-on-surface">
            Set Your Quick-Unlock PIN
          </h1>
          <p className="mt-1.5 max-w-[300px] text-xs leading-relaxed text-text-muted">
            Set a 4-digit PIN for quick register unlock and screen lock. Staff
            won't need to retype passwords between transactions.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="setup-pin-input"
              className="mb-1 block text-xs font-semibold text-secondary"
            >
              Choose 4-Digit PIN
            </label>
            <div className="relative">
              <input
                id="setup-pin-input"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                maxLength={4}
                required
                placeholder="••••"
                className={`${fieldClass} text-center font-mono text-base`}
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setPin(val);
                  setError("");
                }}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="setup-confirm-pin"
              className="mb-1 block text-xs font-semibold text-secondary"
            >
              Confirm 4-Digit PIN
            </label>
            <div className="relative">
              <input
                id="setup-confirm-pin"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                maxLength={4}
                required
                placeholder="••••"
                className={`${fieldClass} text-center font-mono text-base`}
                value={confirmPin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setConfirmPin(val);
                  setError("");
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-text-muted">
            <button
              type="button"
              onClick={() => setShowPin((v) => !v)}
              className="auth-inline-action min-h-10 px-1 font-medium text-primary hover:underline cursor-pointer"
            >
              {showPin ? "Hide numbers" : "Show numbers"}
            </button>
            <span className="text-[11px] text-text-muted">
              Choose a PIN you can recall
            </span>
          </div>

          {error && (
            <p
              role="alert"
              className="p-2.5 rounded-lg bg-danger-bg border border-danger-border text-xs text-danger"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={
              isSubmitting || pin.length !== 4 || confirmPin.length !== 4
            }
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary bg-primary text-sm font-semibold text-white shadow-xs transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>
              {isSubmitting ? "Setting PIN..." : "Save PIN & Enter Register"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void signOut()}
            className="min-h-11 w-full pt-2 text-center text-xs font-medium text-text-muted hover:text-on-surface hover:underline"
          >
            Cancel and sign out
          </button>
        </form>
      </main>
    </div>
  );
};

/**
 * Quick-Unlock Lock Screen (Used for Register Lock & Session Reopen)
 * Shows current user profile photo, name, business name, and 4-digit PIN input.
 */
export const LockScreen: React.FC = () => {
  const { user, organization, unlock, signOut } = useAuth();
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const displayName = getProfileDisplayName(user, organization.owner_name);

  useEffect(() => {
    document.getElementById("unlock-pin")?.focus();
  }, []);

  const handleUnlock = async (pinToTry: string) => {
    setError("");
    setIsSubmitting(true);
    const success = await unlock(pinToTry);
    setIsSubmitting(false);

    if (!success) {
      setPin("");
      setError("Incorrect PIN. Please try again.");
      document.getElementById("unlock-pin")?.focus();
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length >= 4) {
      void handleUnlock(pin);
    }
  };

  return (
    <div className="auth-screen flex min-h-dvh w-full items-center justify-center bg-surface p-4 font-sans text-on-surface">
      <main className="auth-card w-full max-w-[380px] rounded-xl border border-border-standard bg-surface-bright p-6 shadow-level-2 sm:p-8">
        {/* User Avatar and Identity */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 rounded-full ring-4 ring-primary/10">
            <UserAvatar
              src={user?.avatar_url}
              name={displayName}
              size="lg"
            />
          </div>
          <h1 className="text-base font-bold text-on-surface">
            {displayName}
          </h1>
          {user?.email && <p className="mt-0.5 text-xs text-text-muted">{user.email}</p>}
        </div>

        {/* PIN Input Form */}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label
              htmlFor="unlock-pin"
              className="mb-1.5 block text-center text-xs font-semibold text-secondary"
            >
              Enter 4-Digit Quick-Unlock PIN
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-3 h-5 w-5 text-text-muted" />
              <input
                id="unlock-pin"
                className={`${fieldClass} px-10 text-center font-mono text-base`}
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                maxLength={4}
                autoComplete="current-password"
                placeholder="••••"
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setPin(val);
                  setError("");
                  if (val.length === 4) {
                    void handleUnlock(val);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                className="auth-password-toggle absolute right-1 top-1 text-text-muted hover:text-on-surface transition cursor-pointer"
                aria-label={showPin ? "Hide PIN" : "Show PIN"}
              >
                {showPin ?
                  <EyeOff className="h-5 w-5" />
                : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="p-2.5 rounded-lg bg-danger-bg border border-danger-border text-xs text-danger text-center"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || pin.length < 4}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary bg-primary text-sm font-semibold text-white shadow-xs transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            <LockKeyhole className="h-4 w-4" />
            <span>{isSubmitting ? "Unlocking..." : "Unlock Register"}</span>
          </button>

          <button
            type="button"
            onClick={() => void signOut()}
            className="min-h-11 w-full pt-2 text-center text-xs font-medium text-text-muted hover:text-on-surface hover:underline"
          >
            Switch account
          </button>
        </form>
      </main>
    </div>
  );
};

// Re-export SignUpScreen as an alias for AuthScreen for backwards compatibility
export const SignUpScreen = AuthScreen;
