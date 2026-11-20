import React from "react";
import { ArrowRight, FileSearch2, ShieldCheck } from "lucide-react";
import type { FinancialSnapshot } from "../../accounting/types";
import { formatMinorForPreview } from "./financeInput";

interface Props {
  snapshot: FinancialSnapshot;
  onOpenLedger?: (accountId: string) => void;
}

export const TrialBalancePanel: React.FC<Props> = ({ snapshot, onOpenLedger }) => {
  const { trialBalance: tb, balanceSheet: bs, incomeStatement: pl } = snapshot;

  return (
    <section className="aq-finance__section" aria-labelledby="aq-finance-tb-heading">
      <header className="aq-finance__section-header">
        <div>
          <span className="aq-finance__eyebrow">ACCOUNTING REPORTS</span>
          <h2 id="aq-finance-tb-heading">Trial Balance</h2>
          <p>Account balances as of {snapshot.asOfDate} · {snapshot.currency}</p>
        </div>
        <span className="aq-finance__draft-chip"><ShieldCheck size={14} aria-hidden="true" /> Checked sample totals</span>
      </header>
      <div className="aq-finance__stats">
        <div className="aq-finance__stat aq-finance__stat--charcoal">
          <span>Closing debits</span><strong>{formatMinorForPreview(tb.closingDebitMinor)}</strong><small>All posting accounts</small>
        </div>
        <div className="aq-finance__stat aq-finance__stat--mint">
          <span>Closing credits</span><strong>{formatMinorForPreview(tb.closingCreditMinor)}</strong><small>Same source and cutoff</small>
        </div>
        <div className="aq-finance__stat aq-finance__stat--blush">
          <span>Unclosed earnings</span><strong>{formatMinorForPreview(pl.netEarningsMinor)}</strong><small>All posted sample periods</small>
        </div>
      </div>
      <div className="aq-finance__panel">
        <div className="aq-finance__table-scroll">
          <table className="aq-finance__table aq-finance__tb-table">
            <caption className="sr-only">Debit and credit movements and closing balances for each chart account</caption>
            <thead>
              <tr><th scope="col" rowSpan={2}>Account</th><th scope="colgroup" colSpan={2}>Period-to-date movements</th>
                <th scope="colgroup" colSpan={2}>Closing balance</th></tr>
              <tr><th scope="col">Debit</th><th scope="col">Credit</th><th scope="col">Debit</th><th scope="col">Credit</th></tr>
            </thead>
            <tbody>
              {tb.rows.map((row) => (
                <tr key={row.accountId}>
                  <td>
                    {onOpenLedger ? <button type="button" className="aq-finance__account-link" onClick={() => onOpenLedger(row.accountId)}>
                      <span className="aq-finance__code">{row.code}</span> {row.name} <ArrowRight size={13} aria-hidden="true" />
                    </button> : <><span className="aq-finance__code">{row.code}</span> {row.name}</>}
                  </td>
                  <td className="aq-finance__number">{formatMinorForPreview(row.totalDebitMinor)}</td>
                  <td className="aq-finance__number">{formatMinorForPreview(row.totalCreditMinor)}</td>
                  <td className="aq-finance__number aq-finance__emphasis">{formatMinorForPreview(row.closingDebitMinor)}</td>
                  <td className="aq-finance__number aq-finance__emphasis">{formatMinorForPreview(row.closingCreditMinor)}</td>
                </tr>
              ))}
              {tb.rows.length === 0 && <tr><td colSpan={5} className="aq-finance__no-results">No posted source accounts in this snapshot.</td></tr>}
            </tbody>
            <tfoot><tr>
              <th scope="row">Total</th>
              <td className="aq-finance__number">{formatMinorForPreview(tb.totalDebitMinor)}</td>
              <td className="aq-finance__number">{formatMinorForPreview(tb.totalCreditMinor)}</td>
              <td className="aq-finance__number">{formatMinorForPreview(tb.closingDebitMinor)}</td>
              <td className="aq-finance__number">{formatMinorForPreview(tb.closingCreditMinor)}</td>
            </tr></tfoot>
          </table>
        </div>
        <div className="aq-finance__reconciliation">
          <FileSearch2 size={18} aria-hidden="true" />
          <div>
            <strong>Arithmetic reconciliation</strong>
            <p>Assets {formatMinorForPreview(bs.assetsMinor)} = Liabilities {formatMinorForPreview(bs.liabilitiesMinor)} + Total equity {formatMinorForPreview(bs.totalEquityMinor)}.</p>
          </div>
          <span className="aq-finance__status">Difference {formatMinorForPreview(bs.differenceMinor)}</span>
        </div>
        <p className="aq-finance__footnote">These are illustrative posted entries, not an authorized report for any real company. Real reports require a complete server snapshot.</p>
      </div>
    </section>
  );
};
