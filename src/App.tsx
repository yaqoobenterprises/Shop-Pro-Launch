import React, { Suspense, lazy, useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppProvider, useApp } from "./context/AppContext";
import { I18nProvider, useI18n } from "./i18n";
import { Sidebar } from "./components/layout/Sidebar";
import { MobileNav } from "./components/layout/MobileNav";
import { Header } from "./components/layout/Header";
import { ToastContainer } from "./components/common/ToastContainer";
import { CommandPalette } from "./components/layout/CommandPalette";
import { ShortcutsHelpModal } from "./components/layout/ShortcutsHelpModal";
import { QuickExpenseModal } from "./components/expenses/QuickExpenseModal";
import { AuthScreen, LockScreen } from "./components/auth/LockScreen";
import { RegionProvider } from "./regional/region";

// Modern Shop Ledger Views
import {
  ledgerService,
  OFFLINE_SYNC_COMPLETE_EVENT,
} from "./services/ledgerService";

import { LandingPage } from "./components/landing/LandingPage";
import { FirstRunRegionalModal } from "./components/settings/FirstRunRegionalModal";
import { useFeature } from "./config/features";
import { getUserPreferences } from "./services/userPreferencesService";

const ChatView = lazy(() =>
  import("./components/chat/ChatView").then((module) => ({ default: module.ChatView })),
);
const LedgerDashboardView = lazy(() =>
  import("./components/dashboard/LedgerDashboardView").then((module) => ({ default: module.LedgerDashboardView })),
);
const TransactionsExplorerView = lazy(() =>
  import("./components/sales/TransactionsExplorerView").then((module) => ({ default: module.TransactionsExplorerView })),
);
const LedgerReportsView = lazy(() =>
  import("./components/reports/LedgerReportsView").then((module) => ({ default: module.LedgerReportsView })),
);
const LedgerSettingsView = lazy(() =>
  import("./components/settings/LedgerSettingsView").then((module) => ({ default: module.LedgerSettingsView })),
);
const AccountsView = lazy(() =>
  import("./components/accounts/AccountsView").then((module) => ({ default: module.AccountsView })),
);

const I18nPreferenceSync: React.FC = () => {
  const { user } = useAuth();
  const { setLanguage } = useI18n();
  const languageEnabled = useFeature("languageUr");

  useEffect(() => {
    if (!languageEnabled || !user?.id) return;
    let active = true;
    void getUserPreferences(user.id).then(({ language }) => {
      if (active) setLanguage(language);
    });
    return () => {
      active = false;
    };
  }, [languageEnabled, user?.id, setLanguage]);

  return null;
};

const MainShell: React.FC = () => {
  const { currentView } = useApp();
  const { isDemoMode, exitDemoMode, organization, user } = useAuth();
  const { t } = useI18n();
  const regionSettingsEnabled = useFeature("regionSettings");
  const [showRegionalSetup, setShowRegionalSetup] = React.useState(false);

  useEffect(() => {
    setShowRegionalSetup(Boolean(
      regionSettingsEnabled && user?.role === "OWNER" && organization.region_configured === false,
    ));
  }, [regionSettingsEnabled, user?.id, user?.role, organization.id, organization.region_configured]);

  useEffect(() => {
    let syncInFlight: Promise<void> | undefined;
    const synchronizeOfflineWork = () => {
      if (syncInFlight) return;
      syncInFlight = ledgerService
        .flushOfflineQueue()
        .then((result) => {
          window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_COMPLETE_EVENT, {
            detail: result,
          }));
        })
        .catch((error: unknown) => {
          console.error("Could not synchronize offline ledger work:", error);
        })
        .finally(() => {
          syncInFlight = undefined;
        });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") synchronizeOfflineWork();
    };

    synchronizeOfflineWork();
    window.addEventListener("online", synchronizeOfflineWork);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("online", synchronizeOfflineWork);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const renderActiveView = () => {
    switch (currentView) {
      case "chat":
        return <ChatView />;
      case "dashboard":
        return <LedgerDashboardView />;
      case "sales":
        return <TransactionsExplorerView />;
      case "reports":
        return <LedgerReportsView />;
      case "accounts":
        return <AccountsView />;
      case "settings":
        return <LedgerSettingsView />;
      default:
        return <ChatView />;
    }
  };

  return (
    <div className="app-shell flex h-dvh w-full min-w-0 flex-col overflow-hidden font-sans text-on-surface">
      {isDemoMode && (
        <div
          role="status"
          aria-live="polite"
          className="z-40 flex shrink-0 items-center justify-between gap-3 border-b border-primary/20 bg-primary/[0.08] px-4 py-2 text-xs text-primary backdrop-blur-sm sm:px-6"
        >
          <div className="flex items-center gap-2 truncate">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="font-semibold">{t("app.interactiveGuestSandbox")}</span>
            <span className="text-secondary truncate hidden sm:inline">
              {t("app.sampleData")}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void exitDemoMode()}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white shadow-xs transition hover:bg-primary-hover"
            >
              {t("app.exitDemo")}
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        <a
          href="#main-content"
          className="sr-only z-50 rounded-md bg-white px-4 py-2 text-sm font-semibold text-primary shadow-level-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to main content
        </a>
        {/* Sidebar Navigation */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="workspace flex flex-1 flex-col overflow-hidden min-w-0">
          <Header />
          <main
            id="main-content"
            tabIndex={-1}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[calc(3.25rem+env(safe-area-inset-bottom))] md:pb-0"
          >
            <Suspense
              fallback={
                <div role="status" className="flex min-h-32 items-center justify-center text-sm text-text-muted">
                  {t("app.loadingWorkspace")}
                </div>
              }
            >
              {renderActiveView()}
            </Suspense>
          </main>
        </div>

        <MobileNav />
      </div>

      {/* Global Modals & Overlays */}
      <QuickExpenseModal />
      <CommandPalette />
      <ShortcutsHelpModal />
      <ToastContainer />
      <FirstRunRegionalModal
        isOpen={showRegionalSetup}
        onClose={() => setShowRegionalSetup(false)}
      />
    </div>
  );
};

const WorkspaceGate: React.FC = () => {
  const {
    isLoading,
    isLocked,
    user,
    hasLocalAccount,
    isPasswordRecovery,
    isDemoMode,
    enterDemoMode,
  } = useAuth();
  const { t } = useI18n();
  const [authMode, setAuthMode] = React.useState<"signIn" | "signUp" | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-surface flex items-center justify-center text-text-muted">
        {t("app.loadingWorkspace")}
      </div>
    );
  }

  // If password recovery is active, show password reset form
  if (isPasswordRecovery) {
    return <AuthScreen onBackToHome={() => setAuthMode(null)} />;
  }

  // If no active user session and not in demo mode
  if (!user && !isDemoMode) {
    if (authMode) {
      return (
        <AuthScreen
          initialMode={authMode}
          onBackToHome={() => setAuthMode(null)}
        />
      );
    }
    return (
      <LandingPage
        onTryDemo={async () => {
          await enterDemoMode();
        }}
        onOpenAuth={(mode) => setAuthMode(mode || "signIn")}
      />
    );
  }

  // PIN unlock remains optional for accounts that configured it (and not demo mode).
  if (isLocked && !isDemoMode) {
    return <LockScreen />;
  }

  return <MainShell />;
};

const RegionalWorkspace: React.FC = () => {
  const { organization } = useAuth();
  return (
    <RegionProvider
      organizationId={organization.id}
      currency={organization.currency}
      currencySymbol={organization.currency_symbol}
      timeZone={organization.timezone}
      country={organization.country}
    >
      <WorkspaceGate />
    </RegionProvider>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <I18nProvider>
          <I18nPreferenceSync />
          <RegionalWorkspace />
        </I18nProvider>
      </AppProvider>
    </AuthProvider>
  );
}
