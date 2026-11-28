import React, { useState } from "react";
import {
  BarChart3,
  BookOpenText,
  Check,
  LayoutDashboard,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { useTheme } from "../../design-system/useTheme";
import type { ThemePreference } from "../../lib/theme";
import { useI18n } from "../../i18n";
import { Wordmark } from "../common/Wordmark";
import { APP_NAME } from "../../config/app";
import { LandingPreview } from "./LandingPreview";

export interface LandingPageProps {
  onOpenAuth: (initialMode?: "signIn" | "signUp") => void;
  onTryDemo: () => Promise<void> | void;
}

const CAPABILITIES = [
  {
    icon: BookOpenText,
    title: "Record with ease",
    description: "Income, expenses and searchable entries.",
  },
  {
    icon: LayoutDashboard,
    title: "See where you stand",
    description: "Cash, bank and daily operating totals.",
  },
  {
    icon: BarChart3,
    title: "Understand the numbers",
    description: "Clear reports with date and account filters.",
  },
] as const;

const STEPS = [
  { number: "01", title: "Create your account", description: "Start with your business details." },
  { number: "02", title: "Record activity", description: "Review entries before saving." },
  { number: "03", title: "Stay informed", description: "Find activity and follow your balances." },
] as const;

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth, onTryDemo }) => {
  const { t } = useI18n();
  const [theme, setTheme] = useTheme();
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const toggleTheme = () => {
    const next: ThemePreference = theme === "dark" ? "light" : "dark";
    setTheme(next);
  };

  const openDemo = async () => {
    if (isDemoLoading) return;
    setDemoError(null);
    setIsDemoLoading(true);
    try {
      await onTryDemo();
    } catch {
      setDemoError("The demo could not open. Please try again.");
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="shop-landing-page aq-landing" id="top">
      <a href="#main-content" className="aq-landing__skip">Skip to content</a>

      <header className="aq-landing__header">
        <div className="aq-landing__nav aq-landing__container">
          <a href="#top" className="aq-landing__brand" aria-label={`${APP_NAME} home`}>
            <Wordmark />
          </a>

          <nav className="aq-landing__navlinks" aria-label="Page navigation">
            <a href="#platform">Platform</a>
            <a href="#how-it-works">How it works</a>
          </nav>

          <div className="aq-landing__nav-actions">
            <button
              type="button"
              className="aq-landing__theme"
              onClick={toggleTheme}
              aria-label={t("landing.switchTheme")}
              title={t("landing.switchTheme")}
            >
              {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            </button>
            <button type="button" className="aq-landing__signin" onClick={() => onOpenAuth("signIn")}>
              {t("landing.signIn")}
            </button>
            <button type="button" className="aq-landing__button aq-landing__button--primary aq-landing__nav-cta" onClick={() => onOpenAuth("signUp")}>
              Get started
            </button>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className="aq-landing__hero" aria-labelledby="landing-title">
          <div className="aq-landing__container aq-landing__hero-grid">
            <div className="aq-landing__hero-content">
              <h1 id="landing-title">Your business.<span>In clear view.</span></h1>
              <p className="aq-landing__intro">
                Your cashbook, accounts and reports. One clear view.
              </p>
              <div className="aq-landing__hero-actions">
                <button type="button" className="aq-landing__button aq-landing__button--primary" onClick={() => onOpenAuth("signUp")}>
                  Create your account
                </button>
                <button type="button" className="aq-landing__button aq-landing__button--secondary" onClick={() => void openDemo()} disabled={isDemoLoading}>
                  {isDemoLoading ? "Opening demo…" : "Explore demo"}
                </button>
              </div>
              {demoError && <p role="alert" className="aq-landing__error">{demoError}</p>}
              <p className="aq-landing__reassurance"><Check size={15} aria-hidden="true" /> Demo uses sample data, never your real books.</p>
            </div>
            <div className="aq-landing__preview-wrap">
              <LandingPreview />
            </div>
          </div>
        </section>

        <section className="aq-landing__platform" id="platform" aria-labelledby="platform-title">
          <div className="aq-landing__container">
            <div className="aq-landing__section-head">
              <div>
                <h2 id="platform-title">Everything for your working day.</h2>
              </div>
              <p>Built to stay simple as your business grows.</p>
            </div>
            <div className="aq-landing__features">
              {CAPABILITIES.map(({ icon: Icon, title, description }) => (
                <article className="aq-landing__feature" key={title}>
                  <span className="aq-landing__feature-icon"><Icon size={21} strokeWidth={1.75} aria-hidden="true" /></span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
            <p className="aq-landing__upcoming"><ShieldCheck size={16} aria-hidden="true" /> General ledger, invoicing, inventory and payroll are in development.</p>
          </div>
        </section>

        <section className="aq-landing__steps" id="how-it-works" aria-labelledby="steps-title">
          <div className="aq-landing__container">
            <div className="aq-landing__section-head">
              <div>
                <h2 id="steps-title">Start with a clear view.</h2>
              </div>
            </div>
            <div className="aq-landing__steps-grid">
              {STEPS.map((step) => (
                <div className="aq-landing__step" key={step.number}>
                  <span>{step.number}</span>
                  <div><h3>{step.title}</h3><p>{step.description}</p></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="aq-landing__last">
          <div className="aq-landing__container aq-landing__last-inner">
            <div>
              <h2>A clearer day starts here.</h2>
              <p>Bring your business activity into one place.</p>
            </div>
            <button type="button" className="aq-landing__button aq-landing__button--primary" onClick={() => onOpenAuth("signUp")}>
              Get started
            </button>
          </div>
        </section>
      </main>

      <footer className="aq-landing__footer">
        <div className="aq-landing__container aq-landing__footer-inner">
          <span>© {new Date().getFullYear()} {APP_NAME}</span>
          <button type="button" onClick={() => onOpenAuth("signIn")}>Sign in</button>
        </div>
      </footer>
    </div>
  );
};
