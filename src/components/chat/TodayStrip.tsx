import React, { useEffect, useState } from "react";
import { DailySummary } from "../../types/ledger";
import { AnimatedAmount } from "../common/AnimatedAmount";
import { formatDisplayDate, getKarachiBusinessDate } from "../../lib/dates";
import { useI18n } from "../../i18n";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  TrendingUp,
} from "lucide-react";

const isRunningAsInstalledApp = () => {
  if (typeof window === "undefined") return false;
  const iosNavigator = window.navigator as Navigator & { standalone?: boolean };
  const displayModeMatches =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return iosNavigator.standalone === true || displayModeMatches;
};

interface TodayStripProps {
  summary: DailySummary;
  onOpenInstallHelp: () => void;
}

export const TodayStrip: React.FC<TodayStripProps> = ({
  summary,
  onOpenInstallHelp,
}) => {
  const { t } = useI18n();
  const [isInstalled, setIsInstalled] = useState(isRunningAsInstalledApp);

  useEffect(() => {
    const displayMode =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(display-mode: standalone)")
        : null;
    const updateInstalledState = () =>
      setIsInstalled(isRunningAsInstalledApp());
    const handleAppInstalled = () => setIsInstalled(true);

    displayMode?.addEventListener("change", updateInstalledState);
    window.addEventListener("appinstalled", handleAppInstalled);
    updateInstalledState();

    return () => {
      displayMode?.removeEventListener("change", updateInstalledState);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const todayStr = getKarachiBusinessDate();
  const displayDate = formatDisplayDate(todayStr);

  return (
    <div className="cashbook-summary border-b border-border-standard bg-surface-bright px-3 py-4 sm:px-5">
      <div className="cashbook-summary__header mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-lg font-bold tracking-tight text-on-surface sm:text-xl">{t("nav.ledger")}</h1>
          <p className="cashbook-summary__date mt-1 text-xs font-medium text-text-muted">Today · {displayDate}</p>
        </div>

        <div className="flex items-center gap-2">
          {!isInstalled && (
            <button
              type="button"
              onClick={onOpenInstallHelp}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-standard bg-surface-bright px-3 text-xs font-semibold text-secondary transition-colors hover:bg-surface-container-low"
              title="Install App as PWA"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" /> Install
            </button>
          )}
        </div>
      </div>

      {/* 3 Metric Cards: Income, Expense, Net Profit */}
      <div className="cashbook-summary__metrics grid grid-cols-3 gap-2 sm:gap-3">
        {/* Income Card */}
        <div className="summary-metric summary-metric--income flex min-w-0 flex-col justify-between">
          <div className="summary-metric__label flex items-center justify-between">
            <span>{t("dashboard.income")}</span>
            <ArrowDownLeft className="w-3.5 h-3.5" />
          </div>
          <div className="summary-metric__value cashbook-summary__amount font-mono tabular-nums">
            <AnimatedAmount amountPaisa={summary.income_paisa} />
          </div>
        </div>

        {/* Expense Card */}
        <div className="summary-metric summary-metric--expense flex min-w-0 flex-col justify-between">
          <div className="summary-metric__label flex items-center justify-between">
            <span>{t("dashboard.expenses")}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </div>
          <div className="summary-metric__value cashbook-summary__amount font-mono tabular-nums">
            <AnimatedAmount amountPaisa={summary.expense_paisa} />
          </div>
        </div>

        {/* Net Profit Card */}
        <div className="summary-metric summary-metric--profit flex min-w-0 flex-col justify-between">
          <div className="summary-metric__label flex items-center justify-between">
            <span>{t("dashboard.netProfit")}</span>
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
          <div
            className={`summary-metric__value cashbook-summary__amount font-mono tabular-nums ${
              summary.net_profit_paisa < 0 ? "text-danger" : ""
            }`}
          >
            <AnimatedAmount amountPaisa={summary.net_profit_paisa} />
          </div>
        </div>
      </div>

      {/* Capital / Withdrawal Strip (if any exists today) */}
      {(summary.capital_in_paisa > 0 || summary.withdrawal_paisa > 0) && (
        <div className="mt-2 pt-2 border-t border-border-standard flex items-center justify-between text-[11px] text-text-muted">
          <div>
            Capital In:{" "}
            <span className="font-semibold text-secondary font-mono">
              <AnimatedAmount amountPaisa={summary.capital_in_paisa} />
            </span>
          </div>
          <div>
            Withdrawals:{" "}
            <span className="font-semibold text-secondary font-mono">
              <AnimatedAmount amountPaisa={summary.withdrawal_paisa} />
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
