import React, { useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  FileSpreadsheet,
  Landmark,
  Moon,
  Play,
  Receipt,
  Store,
  Sun,
  WifiOff,
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
    <div className="shop-landing-page min-h-screen overflow-x-clip bg-surface font-sans text-on-surface">
      <header className="sticky top-0 z-40 border-b border-border-standard bg-surface-bright">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="inline-flex min-w-0 items-center gap-2.5 text-on-surface">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
              <Store aria-hidden="true" className="h-[18px] w-[18px]" />
            </span>
            <span className="truncate text-base font-bold tracking-tight">Shop Pro</span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={t("landing.switchTheme")}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border-standard bg-surface-bright text-secondary transition-colors hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ink)]"
            >
              {theme === "dark" ? (
                <Sun aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Moon aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth("signIn")}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border-standard bg-surface-bright px-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ink)] sm:px-4"
            >
              {t("landing.signIn")}
            </button>
            <button
              type="button"
              disabled={isDemoLoading}
              onClick={handleLaunchDemo}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ink)] disabled:cursor-wait disabled:opacity-60 sm:px-4"
            >
              <Play aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
              <span className="hidden sm:inline">{t("landing.openDemo")}</span>
              <span className="sm:hidden">{t("landing.demo")}</span>
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="shop-landing-hero border-b border-border-standard py-10 sm:py-14 lg:py-16">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
            <div className="shop-landing-copy max-w-xl lg:py-8">
              <h1 className="max-w-[14ch] text-3xl font-bold leading-tight tracking-tight text-on-surface sm:text-4xl lg:text-5xl">
                {t("landing.headline")}
              </h1>

              <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  disabled={isDemoLoading}
                  onClick={handleLaunchDemo}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ink)] disabled:cursor-wait disabled:opacity-60"
                >
                  <Play aria-hidden="true" className="h-4 w-4 fill-current" />
                  {isDemoLoading ? t("landing.openingDemo") : t("landing.openDemo")}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth("signUp")}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border-standard bg-surface-bright px-5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ink)]"
                >
                  {t("landing.createShop")}
                  <ArrowRight aria-hidden="true" className="h-4 w-4 text-secondary" />
                </button>
              </div>
            </div>

            <section
              aria-label={t("landing.exampleRegister")}
              className="shop-landing-preview min-w-0 rounded-xl border border-border-standard bg-surface-bright p-3 shadow-level-1 sm:p-5"
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border-standard pb-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Receipt aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                  <h2 className="truncate text-sm font-semibold text-on-surface sm:text-base">
                    {t("landing.exampleRegister")}
                  </h2>
                </div>
                <span className="inline-flex shrink-0 items-center rounded-full border border-border-standard bg-surface-container-low px-2.5 py-1 text-[11px] font-medium text-secondary">
                  {t("landing.exampleData")}
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
                <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border-standard bg-surface-container-low px-3 py-2.5 sm:block sm:px-3 sm:py-3">
                  <dt className="text-xs font-medium text-secondary">{t("landing.incomeToday")}</dt>
                  <dd className="whitespace-nowrap text-right font-mono text-sm font-semibold text-primary sm:mt-1 sm:text-left sm:text-base">
                    {formatPaisa(2_600_000)}
                  </dd>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border-standard bg-surface-container-low px-3 py-2.5 sm:block sm:px-3 sm:py-3">
                  <dt className="text-xs font-medium text-secondary">{t("landing.expensesToday")}</dt>
                  <dd className="whitespace-nowrap text-right font-mono text-sm font-semibold text-on-surface sm:mt-1 sm:text-left sm:text-base">
                    {formatPaisa(365_000)}
                  </dd>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border-standard bg-surface-container-low px-3 py-2.5 sm:block sm:px-3 sm:py-3">
                  <dt className="text-xs font-medium text-secondary">{t("landing.netProfitToday")}</dt>
                  <dd className="whitespace-nowrap text-right font-mono text-sm font-semibold text-on-surface sm:mt-1 sm:text-left sm:text-base">
                    {formatPaisa(2_235_000)}
                  </dd>
                </div>
              </dl>

              <h3 className="mt-4 text-xs font-semibold text-secondary">
                {t("landing.recentEntries")}
              </h3>
              <ul className="mt-2 divide-y divide-border-standard overflow-hidden rounded-lg border border-border-standard">
                <li className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-success-bg text-success">
                      <ArrowDownLeft aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-on-surface">{t("landing.sampleSale")}</p>
                      <p className="truncate text-[11px] text-secondary">{t("landing.cashDrawer")}</p>
                    </div>
                  </div>
                  <span className="whitespace-nowrap text-right font-mono text-xs font-semibold text-success">+{formatPaisa(1_850_000)}</span>
                </li>
                <li className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-danger-bg text-danger">
                      <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-on-surface">{t("landing.sampleExpense")}</p>
                      <p className="truncate text-[11px] text-secondary">{t("landing.cashDrawer")}</p>
                    </div>
                  </div>
                  <span className="whitespace-nowrap text-right font-mono text-xs font-semibold text-on-surface">−{formatPaisa(320_000)}</span>
                </li>
                <li className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-success-bg text-success">
                      <ArrowDownLeft aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-on-surface">{t("landing.sampleSale")}</p>
                      <p className="truncate text-[11px] text-secondary">{t("landing.bankAccount")}</p>
                    </div>
                  </div>
                  <span className="whitespace-nowrap text-right font-mono text-xs font-semibold text-success">+{formatPaisa(750_000)}</span>
                </li>
              </ul>
            </section>
          </div>
        </section>

        <section className="bg-surface-container-low/40 py-10 sm:py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-xl font-semibold tracking-tight text-on-surface sm:text-2xl">
              {t("landing.featuresTitle")}
            </h2>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <article className="rounded-xl border border-border-standard bg-surface-bright p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Receipt aria-hidden="true" className="h-4 w-4" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-on-surface">{t("landing.salesExpenses")}</h3>
                <p className="mt-1.5 text-sm leading-5 text-secondary">{t("landing.salesExpensesDescription")}</p>
              </article>
              <article className="rounded-xl border border-border-standard bg-surface-bright p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Landmark aria-hidden="true" className="h-4 w-4" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-on-surface">{t("landing.accountsTitle")}</h3>
                <p className="mt-1.5 text-sm leading-5 text-secondary">{t("landing.accountsDescription")}</p>
              </article>
              <article className="rounded-xl border border-border-standard bg-surface-bright p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-on-surface">{t("landing.reportsTitle")}</h3>
                <p className="mt-1.5 text-sm leading-5 text-secondary">{t("landing.reportsDescription")}</p>
              </article>
              <article className="rounded-xl border border-border-standard bg-surface-bright p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <WifiOff aria-hidden="true" className="h-4 w-4" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-on-surface">{t("landing.offlineTitle")}</h3>
                <p className="mt-1.5 text-sm leading-5 text-secondary">{t("landing.offlineDescription")}</p>
              </article>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-standard bg-surface-bright py-5 text-xs text-secondary">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 sm:px-6">
          <span className="inline-flex items-center gap-2 font-medium text-on-surface">
            <Store aria-hidden="true" className="h-4 w-4 text-primary" />
            Shop Pro
            <span className="font-normal text-secondary">© {new Date().getFullYear()}</span>
          </span>
          <nav aria-label={t("landing.footerNavigation")} className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <button
              type="button"
              onClick={() => onOpenAuth("signIn")}
              className="min-h-10 rounded-sm transition-colors hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ink)]"
            >
              {t("landing.signIn")}
            </button>
            <button
              type="button"
              disabled={isDemoLoading}
              onClick={handleLaunchDemo}
              className="min-h-10 rounded-sm transition-colors hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ink)] disabled:cursor-wait disabled:opacity-60"
            >
              {t("landing.openDemo")}
            </button>
          </nav>
        </div>
      </footer>
    </div>
  );
};
