import React, { useState } from "react";
import {
  Sparkles,
  Play,
  ArrowRight,
  ShieldCheck,
  WifiOff,
  Landmark,
  Wallet,
  TrendingUp,
  Receipt,
  Users,
  CheckCircle2,
  Lock,
  ArrowDownLeft,
  ArrowUpRight,
  Sun,
  Moon,
  Store,
  Layers,
  FileSpreadsheet,
} from "lucide-react";
import { getSavedTheme, applyTheme, ThemePreference } from "../../lib/theme";
import { useI18n } from "../../i18n";
import { formatPaisa } from "../../lib/money";

export interface LandingPageProps {
  onOpenAuth: (initialMode?: "signIn" | "signUp") => void;
  onTryDemo: () => Promise<void> | void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenAuth,
  onTryDemo,
}) => {
  const { t } = useI18n();
  const [theme, setTheme] = useState<ThemePreference>(() => getSavedTheme());
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  const toggleTheme = () => {
    const nextTheme: ThemePreference = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
  };

  const handleLaunchDemo = async () => {
    setIsDemoLoading(true);
    try {
      await onTryDemo();
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface font-sans text-on-surface transition-colors duration-200">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-border-standard bg-surface-bright/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-level-1">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-on-surface sm:text-lg">
                Shop Pro
              </span>
              <span className="ml-1.5 hidden rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary sm:inline-block">
                Ledger
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-standard bg-surface text-secondary hover:bg-surface-container-low transition-colors"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onOpenAuth("signIn")}
              className="min-h-9 rounded-lg border border-border-standard bg-surface-bright px-3.5 text-xs font-semibold text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer"
            >
              {t("landing.signIn")}
            </button>

            <button
              type="button"
              disabled={isDemoLoading}
              onClick={handleLaunchDemo}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-white shadow-level-1 hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50"
            >
              <Play className="h-3 w-3 fill-current" />
              <span className="hidden sm:inline">{t("landing.tryDemo")}</span>
              <span className="sm:hidden">{t("landing.demo")}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-12 sm:py-20 lg:py-24">
        {/* Subtle decorative background gradient */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
        >
          <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-primary to-emerald-300 opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{t("landing.badge")}</span>
            </div>

            <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-on-surface sm:text-5xl lg:text-6xl">
              {t("landing.headline")}{" "}
              <span className="text-primary">{t("landing.zeroHassle")}</span>
            </h1>

            <p className="mt-5 text-sm leading-relaxed text-text-muted sm:text-base lg:text-lg">
              {t("landing.description")}
            </p>

            {/* Hero CTAs */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              <button
                type="button"
                disabled={isDemoLoading}
                onClick={handleLaunchDemo}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-white shadow-level-2 hover:bg-primary-hover transition-all hover:scale-[1.02] cursor-pointer disabled:opacity-50"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>{t("landing.guestDemo")}</span>
                <span className="text-xs font-normal opacity-80">{t("landing.noSignup")}</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenAuth("signUp")}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border-standard bg-surface-bright px-6 text-sm font-semibold text-on-surface shadow-level-1 hover:bg-surface-container-low transition-colors cursor-pointer"
              >
                <span>{t("landing.createShop")}</span>
                <ArrowRight className="h-4 w-4 text-secondary" />
              </button>
            </div>

            {/* Quick Proof Badges */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-text-muted sm:gap-6">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {t("landing.offlineReady")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {t("landing.reconciliation")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {t("landing.regional")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {t("landing.secure")}
              </span>
            </div>
          </div>

          {/* Interactive Live Preview Mockup Card */}
          <div className="mx-auto mt-12 max-w-4xl rounded-2xl border border-border-standard bg-surface-bright p-4 shadow-level-3 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-standard pb-4">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-danger/80" />
                <span className="h-3 w-3 rounded-full bg-warning/80" />
                <span className="h-3 w-3 rounded-full bg-success/80" />
                <span className="ml-2 text-xs font-semibold text-text-muted">
                  Interactive Register Preview — Today (Karachi)
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-2.5 py-0.5 text-[11px] font-semibold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                {t("landing.registerActive")}
              </span>
            </div>

            {/* Metric Strips */}
            <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-4">
              <div className="rounded-xl border border-border-standard bg-surface-container-low p-3 sm:p-4">
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>{t("landing.incomeToday")}</span>
                  <ArrowDownLeft className="h-3.5 w-3.5 text-primary" />
                </div>
                <p className="mt-1 font-mono text-base font-bold text-primary sm:text-xl">
                  {formatPaisa(2_600_000)}
                </p>
              </div>

              <div className="rounded-xl border border-border-standard bg-surface-container-low p-3 sm:p-4">
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>{t("landing.expensesToday")}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-danger" />
                </div>
                <p className="mt-1 font-mono text-base font-bold text-danger sm:text-xl">
                  {formatPaisa(365_000)}
                </p>
              </div>

              <div className="rounded-xl border border-border-standard bg-surface-container-low p-3 sm:p-4">
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>{t("landing.netProfitToday")}</span>
                  <TrendingUp className="h-3.5 w-3.5 text-on-surface" />
                </div>
                <p className="mt-1 font-mono text-base font-bold text-on-surface sm:text-xl">
                  {formatPaisa(2_235_000)}
                </p>
              </div>
            </div>

            {/* Sample Feed Items */}
            <div className="mt-4 space-y-2 rounded-xl border border-border-standard/60 bg-surface p-3">
              <div className="flex items-center justify-between rounded-lg bg-surface-bright p-2.5 text-xs shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-success-bg text-success">
                    <ArrowDownLeft className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-on-surface">LED Monitor 24-inch</span>
                    <span className="ml-2 text-[11px] text-text-muted">{t("landing.cashDrawer")} · 2:15 PM</span>
                  </div>
                </div>
                <span className="font-mono font-bold text-success">+{formatPaisa(1_850_000)}</span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-surface-bright p-2.5 text-xs shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-danger-bg text-danger">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-on-surface">Generator Petrol Fuel</span>
                    <span className="ml-2 text-[11px] text-text-muted">{t("landing.cashDrawer")} · 1:40 PM</span>
                  </div>
                </div>
                <span className="font-mono font-bold text-danger">−{formatPaisa(320_000)}</span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-surface-bright p-2.5 text-xs shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-success-bg text-success">
                    <ArrowDownLeft className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-on-surface">Wholesale Accessories Batch</span>
                    <span className="ml-2 text-[11px] text-text-muted">{t("landing.bankAccount")} · 11:30 AM</span>
                  </div>
                </div>
                <span className="font-mono font-bold text-success">+{formatPaisa(750_000)}</span>
              </div>
            </div>

            {/* Launch Banner inside preview */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
              <span className="text-secondary">
                {t("landing.tryTransactions")}
              </span>
              <button
                type="button"
                disabled={isDemoLoading}
                onClick={handleLaunchDemo}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-hover transition-colors"
              >
                <Play className="h-3 w-3 fill-current" />
                Launch Interactive Sandbox
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Value Grid */}
      <section className="border-t border-border-standard bg-surface-container-low/40 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-on-surface sm:text-3xl">
              Engineered for High-Speed Shop Operations
            </h2>
            <p className="mt-3 text-xs leading-relaxed text-text-muted sm:text-sm">
              Replace messy paper registers and complicated accounting suites with a
              purpose-built system designed around how shopkeepers actually work.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Feature 1 */}
            <div className="rounded-2xl border border-border-standard bg-surface-bright p-6 shadow-level-1">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Receipt className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-on-surface">
                Instant Chat Ledger & Quick Entry
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-text-muted">
                Record transactions by voice or typing natural phrases like &quot;sale 4500 cash&quot;
                or &quot;chai 150&quot;. The built-in deterministic parser classifies category and
                amount instantly with zero mistakes.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="rounded-2xl border border-border-standard bg-surface-bright p-6 shadow-level-1">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Landmark className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-on-surface">
                Multi-Account & Cash Reconciliation
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-text-muted">
                Track your Cash Drawer, Meezan Bank, JazzCash, EasyPaisa, or custom accounts.
                Every sale and expense updates account balances with complete transfer audits.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="rounded-2xl border border-border-standard bg-surface-bright p-6 shadow-level-1">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <WifiOff className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-on-surface">
                100% Offline Resilience (PWA)
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-text-muted">
                Load speed under 200ms with offline SQLite storage. Transactions are queued
                locally and seamlessly synced with cloud conflict resolution when connection
                restores.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="rounded-2xl border border-border-standard bg-surface-bright p-6 shadow-level-1">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Layers className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-on-surface">
                Audited Ledgers & Single-Click Detail
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-text-muted">
                Ledger feeds show meaningful payment accounts and time instead of raw emails.
                A single tap opens the full audit trail: Transaction ID, creator, notes, and
                reversals.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="rounded-2xl border border-border-standard bg-surface-bright p-6 shadow-level-1">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-on-surface">
                Daily Closings & Net Profit Reports
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-text-muted">
                Never wonder where the shop money went. Generate daily, weekly, and monthly
                closings with visual expense breakdowns and 1-click CSV exports.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="rounded-2xl border border-border-standard bg-surface-bright p-6 shadow-level-1">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-on-surface">
                Multi-Tenant Isolation & Role Security
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-text-muted">
                Tenant isolation guarantees your business numbers are strictly private.
                Role-based access (Owner, Manager, Staff) and quick 4-digit PIN locks secure
                the shop register.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer Banner */}
      <section className="border-t border-border-standard bg-surface py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
          <div className="rounded-3xl border border-border-standard bg-surface-bright p-8 shadow-level-2 sm:p-12">
            <h2 className="text-2xl font-extrabold text-on-surface sm:text-4xl">
              {t("landing.upgradeTitle")}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-xs leading-relaxed text-text-muted sm:text-sm">
              {t("landing.upgradeDescription")}
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={isDemoLoading}
                onClick={handleLaunchDemo}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-white shadow-level-2 hover:bg-primary-hover transition-all cursor-pointer disabled:opacity-50"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>{t("landing.trySandbox")}</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenAuth("signUp")}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border-standard bg-surface px-6 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer"
              >
                <span>{t("landing.registerShop")}</span>
                <ArrowRight className="h-4 w-4 text-secondary" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border-standard bg-surface-container-low/60 py-8 text-xs text-text-muted">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 font-medium">
            <Store className="h-4 w-4 text-primary" />
            <span>Shop Pro</span>
            <span>·</span>
            <span>{t("landing.designSystem")}</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onOpenAuth("signIn")}
              className="hover:text-on-surface transition-colors"
            >
              {t("landing.signIn")}
            </button>
            <button
              type="button"
              onClick={handleLaunchDemo}
              className="hover:text-on-surface transition-colors"
            >
              {t("landing.sandboxDemo")}
            </button>
            <span>© {new Date().getFullYear()} Shop Pro. {t("landing.copyright")}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
