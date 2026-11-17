import React, { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useApp } from "../../context/AppContext";
import { getKarachiBusinessDate } from "../../lib/dates";
import { ledgerService } from "../../services/ledgerService";
import type { DailySummary } from "../../types/ledger";
import { isFeatureEnabled } from "../../config/features";
import { AiAccountantPanel } from "./AiAccountantPanel";

const emptySummary = (): DailySummary => ({
  business_date: getKarachiBusinessDate(),
  income_paisa: 0,
  expense_paisa: 0,
  net_profit_paisa: 0,
  capital_in_paisa: 0,
  withdrawal_paisa: 0,
  adjustment_in_paisa: 0,
  adjustment_out_paisa: 0,
  transaction_count: 0,
});

export const LedgerMateView: React.FC = () => {
  const { user, organization, isCloudAccount } = useAuth();
  const { dataVersion } = useApp();
  const [summary, setSummary] = useState<DailySummary>(emptySummary);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    void ledgerService.getDailySummary(getKarachiBusinessDate())
      .then((nextSummary) => {
        if (active) setSummary(nextSummary);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : "Today's ledger summary could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [dataVersion, organization.id, user?.id]);

  if (!isFeatureEnabled("chatQueries")) {
    return <section className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-text-muted">LedgerMate AI is currently unavailable.</section>;
  }

  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    {loading && <span className="sr-only" role="status">Loading Shop Pro ledger context…</span>}
    {loadError && <div className="border-b border-warning-border bg-warning-bg px-4 py-2 text-xs text-warning">LedgerMate can still answer general accounting questions. Current daily summary could not be refreshed: {loadError}</div>}
    <AiAccountantPanel summary={summary} userId={user?.id || ""} organizationId={organization.id} isCloudAccount={isCloudAccount} />
  </div>;
};
