import React from "react";
import { useAuth } from "../../context/AuthContext";
import { getKarachiBusinessDate } from "../../lib/dates";
import type { DailySummary } from "../../types/ledger";
import { useRegion } from "../../regional/region";
import { hasPermission } from "../../lib/permissions";
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
  const { user, organization, isCloudAccount, isDemoMode } = useAuth();
  const { region } = useRegion();
  if (!isFeatureEnabled("chatQueries")) {
    return <section className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-text-muted">LedgerMate AI is currently unavailable.</section>;
  }

  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <AiAccountantPanel key={`${organization.id}:${user?.id || "demo"}`} summary={emptySummary()} userId={user?.id || ""} organizationId={organization.id} isCloudAccount={isCloudAccount && !isDemoMode} currency={region.currency} canPrepareActions={isCloudAccount && !isDemoMode && region.currency === "PKR" && hasPermission(user?.role, "VOID_EXPENSE")} />
  </div>;
};
