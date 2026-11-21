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
import { MfaChallengeScreen } from "./components/auth/MfaChallengeScreen";
import { RegionProvider } from "./regional/region";
import {
  ledgerService,
  OFFLINE_SYNC_COMPLETE_EVENT,
} from "./services/ledgerService";
import { LandingPage } from "./components/landing/LandingPage";
import { FirstRunRegionalModal } from "./components/settings/FirstRunRegionalModal";
import { isFeatureEnabled } from "./config/features";
import { getUserPreferences } from "./services/userPreferencesService";
import {getStagingFinanceNavItems} from "./components/accounting/stagingFinanceNavigation";
import {
  ReceivablesWorkspace, SalesDraftsWorkspace, GeneralLedgerTrialBalanceWorkspace, SalesInvoiceLifecycleWorkspace, CashCollectionWorkspace, CustomerReceiptDraftWorkspace,
} from "./components/accounting/FinanceLazyRoutes";
const FinanceDesignPreview = lazy(() => import("./components/accounting/FinanceDesignPreview").then(m=>({default:m.FinanceDesignPreview})));
const ChatView = lazy(() =>
  import("./components/chat/ChatView").then((module) => ({ default: module.ChatView })),
);
const LedgerMateView = lazy(() =>
  import("./components/chat/LedgerMateView").then((module) => ({ default: module.LedgerMateView })),
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
  const { user, isCloudAccount } = useAuth();
  const { setLanguage } = useI18n();
  const languageEnabled = isFeatureEnabled("languageUr");

  useEffect(() => {
    if (!languageEnabled || !user?.id) return;
    let active = true;
    void getUserPreferences(user.id).then(({ language }) => {
      if (active) setLanguage(language);
    });
    return () => {
      active = false;
    };
  }, [languageEnabled, user?.id, isCloudAccount, setLanguage]);

  return null;
};

const MainShell: React.FC = () => {
  const { currentView, setCurrentView } = useApp();
  const { isDemoMode, exitDemoMode, organization, user, isCloudAccount } = useAuth();
  const { t } = useI18n();
  const companySetupEnabled = isFeatureEnabled("companySetupWizard");
  const [showRegionalSetup, setShowRegionalSetup] = React.useState(false);

  useEffect(() => {
    // A real owner sees the mandatory setup only when verified account setup is unfinished.
    // The isolated demo gets an explicit, skippable preview instead.
    if (isDemoMode) return;
    setShowRegionalSetup(Boolean(
      companySetupEnabled && user?.role === "OWNER" && organization.region_configured === false,
    ));
  }, [companySetupEnabled, isDemoMode, user?.id, user?.role, organization.id, organization.region_configured]);

  useEffect(() => {
    if (currentView === "aqvora-erp-preview") return;
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
  }, [currentView]);

  if (currentView === "aqvora-erp-preview") return <Suspense fallback={<div role="status">Loading AQVORA ERP review…</div>}><FinanceDesignPreview
    onClose={()=>setCurrentView("dashboard")}
    stagingLinks={getStagingFinanceNavItems({isCloudAccount,isDemoMode,role:user?.role})}
    onOpenStaging={setCurrentView}/></Suspense>;

  const renderActiveView = () => {
    switch (currentView) {
      case "chat":
        return <ChatView />;
      case "ai":
        return <LedgerMateView />;
      case "dashboard":
        return <LedgerDashboardView />;
      case "sales":
        return <TransactionsExplorerView />;
      case "reports":
        return <LedgerReportsView />;
      case "accounts":
        return <AccountsView />;
      case "aqvora-receivables":
        return <ReceivablesWorkspace />;
      case "aqvora-sales-drafts":
        return <SalesDraftsWorkspace />;
      case "aqvora-gl-tb": return <GeneralLedgerTrialBalanceWorkspace />;
      case "aqvora-sales-lifecycle": return <SalesInvoiceLifecycleWorkspace />;
      case "aqvora-cash-collections": return <CashCollectionWorkspace />;
      case "aqvora-receipt-drafts": return <CustomerReceiptDraftWorkspace />;
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
          className="z-40 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border-standard bg-surface-bright px-4 py-2 sm:px-6"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-text-muted">Sample workspace · no live company data</span>
            {companySetupEnabled && (
              <button
                type="button"
                onClick={() => setShowRegionalSetup(true)}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border-standard bg-surface-container-low px-3 text-xs font-semibold text-on-surface hover:bg-surface-bright"
              >
                Preview company setup
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => void exitDemoMode()}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {t("app.exitDemo")}
          </button>
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
    isPasswordRecovery,
    mfaChallengeRequired,
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

  if (isPasswordRecovery) {
    return <AuthScreen />;
  }

  if (mfaChallengeRequired) return <MfaChallengeScreen />;

  if (!user && !isDemoMode) {
    if (authMode) {
      return (
        <AuthScreen initialMode={authMode} onBack={() => setAuthMode(null)} />
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