import React from "react";
import { ArrowUpRight, RefreshCw, ShieldCheck } from "lucide-react";
import type { LedgerAccount } from "../../types/ledger";
import { FinancialDonut } from "../common/FinancialDonut";

interface Props {
  accounts: readonly LedgerAccount[];
  onRefresh: () => void;
  isRefreshing?: boolean;
}

/** Read-only legacy payment-account distribution, never an accrual balance sheet. */
export const PaymentAccountInsights: React.FC<Props> = ({ accounts, onRefresh, isRefreshing }) => {
  const active = accounts.filter((a) => a.is_active);
  const positive = active.filter((a) =>
    Number.isSafeInteger(a.balance_paisa) && a.balance_paisa > 0);
  const sorted = [...positive].sort((a, b) => b.balance_paisa - a.balance_paisa);

  return <div className="aq-accounts-insights" aria-label="Payment account insights">
    <section className="aq-accounts-insights__panel">
      <div className="aq-accounts-insights__heading">
        <div>
          <h2>Balance distribution</h2>
          <p className="sr-only">Share of positive active balances only; zero and negative balances are excluded.</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={isRefreshing}
          aria-label="Refresh payment-account balances">
          <RefreshCw size={16} aria-hidden="true"/> Refresh
        </button>
      </div>
      {sorted.length ? <FinancialDonut label="Positive balances" legendLabel="Positive balance allocation" centerLabel="Positive balances" items={sorted.map(account=>({key:account.id,label:account.name,amount:account.balance_paisa}))}/> :
        <p className="aq-accounts-insights__empty">
          No positive active balances available.
        </p>}
    </section>

    <section className="aq-accounts-insights__panel aq-accounts-insights__status">
      <div>
        <span className="aq-accounts-insights__eyebrow"><ShieldCheck size={20} aria-hidden="true"/></span>
        <h2>Account status</h2>
      </div>
      <dl>
        <div><dt>Active</dt><dd>{active.length}</dd></div>
        <div><dt>Inactive</dt><dd>{accounts.length - active.length}</dd></div>
        <div><dt>Negative</dt><dd>{active.filter(a => a.balance_paisa < 0).length}</dd></div>
        <div><dt>Primary</dt><dd>{active.find((a) => a.is_default)?.name || "Not selected"}</dd></div>
      </dl>
      <div className="aq-accounts-insights__scope">
        <ArrowUpRight size={17} aria-hidden="true"/>
        <p className="sr-only">These are operational cash/bank/wallet balances, not reconciled bank statements or a formal balance sheet.</p>
      </div>
    </section>
  </div>;
};
