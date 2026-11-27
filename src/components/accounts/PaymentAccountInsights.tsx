import React from "react";
import { ArrowUpRight, RefreshCw, ShieldCheck } from "lucide-react";
import type { LedgerAccount } from "../../types/ledger";
import { FinancialDonut } from "../common/FinancialDonut";
import { formatRecordedPaisa as formatPaisa } from "../../lib/money";

interface Props {
  accounts: readonly LedgerAccount[];
  onRefresh: () => void;
  isRefreshing?: boolean;
}

const label = (type: LedgerAccount["type"]) =>
  type === "CASH" ? "Cash" : type === "BANK" ? "Bank" : type === "DIGITAL_WALLET" ? "Wallet" : "Other";

/** Read-only legacy payment-account distribution, never an accrual balance sheet. */
export const PaymentAccountInsights: React.FC<Props> = ({ accounts, onRefresh, isRefreshing }) => {
  const active = accounts.filter((a) => a.is_active);
  const positive = active.filter((a) =>
    Number.isSafeInteger(a.balance_paisa) && a.balance_paisa > 0);
  const total = positive.reduce((n, a) => n + BigInt(a.balance_paisa), 0n);
  const sorted = [...positive].sort((a, b) => b.balance_paisa - a.balance_paisa);
  const percent = (paisa: number) =>
    total > 0n ? Number((BigInt(paisa) * 1000n) / total) / 10 : 0;

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
      {sorted.length>0 && <FinancialDonut label="Positive balances" centerLabel="Positive balances" items={sorted.map(account=>({key:account.id,label:account.name,amount:account.balance_paisa}))}/>}
      {sorted.length ? <ul className="aq-accounts-insights__bars" aria-label="Positive balance allocation">
        {sorted.map((account) => <li key={account.id}>
          <div className="aq-accounts-insights__row">
            <span><i aria-hidden="true"/><strong>{account.name}</strong>
              <small>{label(account.type)}</small></span>
            <span><strong>{formatPaisa(account.balance_paisa)}</strong>
              <small>{percent(account.balance_paisa).toFixed(1)}%</small></span>
          </div>
          <div className="aq-accounts-insights__track" aria-hidden="true">
            <div style={{ width: `${percent(account.balance_paisa)}%` }} />
          </div>
        </li>)}
      </ul> :
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
