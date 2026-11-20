import React, { useMemo, useState } from "react";
import { BookOpenText, ArrowRightLeft } from "lucide-react";
import type { ChartAccount, PostedJournal } from "../../accounting/types";
import { parseMinorUnits } from "../../accounting/minorUnits";
import { formatMinorForPreview } from "./financeInput";

interface Props {
  accounts: ChartAccount[];
  journals: PostedJournal[];
  asOfDate: string;
  selectedAccountId?: string;
}

interface LedgerMovement {
  key: string;
  date: string;
  voucher: string;
  debit: string;
  credit: string;
  balance: string;
}

export const GeneralLedgerPanel: React.FC<Props> = ({
  accounts, journals, asOfDate, selectedAccountId,
}) => {
  const [chosen, setChosen] = useState("");
  const accountId = selectedAccountId || chosen || accounts[0]?.id || "";
  const account = accounts.find((entry) => entry.id === accountId);

  const movements = useMemo(() => {
    let running = 0n;
    const sorted = [...journals].filter((j) => j.businessDate <= asOfDate)
      .sort((a, b) => a.businessDate.localeCompare(b.businessDate) || a.id.localeCompare(b.id));
    const result: LedgerMovement[] = [];
    for (const journal of sorted) {
      for (const [index, line] of journal.lines.entries()) {
        if (line.accountId !== accountId) continue;
        running += parseMinorUnits(line.debitMinor) - parseMinorUnits(line.creditMinor);
        result.push({
          key: `${journal.id}-${index}`,
          date: journal.businessDate,
          voucher: journal.id,
          debit: line.debitMinor,
          credit: line.creditMinor,
          balance: running.toString(),
        });
      }
    }
    return result;
  }, [accountId, asOfDate, journals]);

  const closing = movements.at(-1)?.balance || "0";
  const signed = parseMinorUnits(closing);

  return (
    <section className="aq-finance__section" aria-labelledby="aq-finance-gl-heading">
      <header className="aq-finance__section-header">
        <div>
          <span className="aq-finance__eyebrow">ACCOUNT ACTIVITY</span>
          <h2 id="aq-finance-gl-heading">General Ledger</h2>
          <p>Voucher-backed movements · {asOfDate}</p>
        </div>
        <span className="aq-finance__draft-chip"><BookOpenText size={14} aria-hidden="true" /> Read-only sample</span>
      </header>
      <div className="aq-finance__panel">
        <div className="aq-finance__ledger-head">
          <label className="aq-finance__ledger-picker">
            <span>Choose a ledger account</span>
            <select value={accountId} onChange={(event) => setChosen(event.target.value)}>
              {accounts.filter((a) => a.isPosting).map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.code} · {entry.name}</option>
              ))}
            </select>
          </label>
          <div className="aq-finance__ledger-balance">
            <span>Closing balance</span>
            <strong>{formatMinorForPreview(signed < 0n ? (-signed).toString() : closing)}</strong>
            <small>{signed < 0n ? "Credit" : "Debit"} balance</small>
          </div>
        </div>
        <div className="aq-finance__table-scroll">
          <table className="aq-finance__table aq-finance__gl-table">
            <thead><tr>
              <th scope="col">Date</th><th scope="col">Voucher</th>
              <th scope="col">Debit</th><th scope="col">Credit</th>
              <th scope="col">Running balance</th>
            </tr></thead>
            <tbody>
              {movements.map((movement) => {
                const amount = parseMinorUnits(movement.balance);
                return (
                  <tr key={movement.key}>
                    <td>{movement.date}</td><td><span className="aq-finance__code">{movement.voucher}</span></td>
                    <td className="aq-finance__number">{formatMinorForPreview(movement.debit)}</td>
                    <td className="aq-finance__number">{formatMinorForPreview(movement.credit)}</td>
                    <td className="aq-finance__number aq-finance__emphasis">
                      {formatMinorForPreview(amount < 0n ? (-amount).toString() : movement.balance)}
                      <small className="aq-finance__running-side">{amount < 0n ? "Cr" : "Dr"}</small>
                    </td>
                  </tr>
                );
              })}
              {!movements.length && <tr><td colSpan={5} className="aq-finance__no-results">No posted movements for this account in the selected sample period.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="aq-finance__reconciliation">
          <ArrowRightLeft size={18} aria-hidden="true" />
          <div><strong>{account?.name || "Ledger account"}</strong>
            <p>{movements.length} lines across the sample posted voucher source. All values are exact minor units.</p></div>
        </div>
        <p className="aq-finance__footnote">Read-only demonstration. Real journals, opening balances, reconciliation and permissions will come from the secure backend.</p>
      </div>
    </section>
  );
};
