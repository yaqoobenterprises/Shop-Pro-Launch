import React, { useMemo, useRef, useState } from "react";
import { ArrowRightLeft, LockKeyhole, Plus, RotateCcw, Trash2 } from "lucide-react";
import { previewJournalDraft } from "../../accounting/journalPreview";
import type { ChartAccount, JournalLineInput, JournalPreviewPolicy } from "../../accounting/types";
import { formatMinorForPreview, rupeeTextToMinor } from "./financeInput";

type DraftRow = {
  id: string;
  accountId: string;
  debit: string;
  credit: string;
  partyId: string;
  openItemId: string;
  stockMovementId: string;
};
const blank = (id: number): DraftRow => ({
  id: `row-${id}`, accountId: "", debit: "", credit: "",
  partyId: "", openItemId: "", stockMovementId: "",
});

interface Props {
  accounts: ChartAccount[];
  policy: JournalPreviewPolicy;
  initialDate: string;
}

export const JournalComposer: React.FC<Props> = ({ accounts, policy, initialDate }) => {
  const counter = useRef(2);
  const [date, setDate] = useState(initialDate);
  const [rows, setRows] = useState<DraftRow[]>([blank(1), blank(2)]);
  const [showIssues, setShowIssues] = useState(false);

  const postable = useMemo(() => accounts
    .filter((account) => account.isActive && account.isPosting)
    .sort((a, b) => a.code.localeCompare(b.code)), [accounts]);

  const draftLines = useMemo<JournalLineInput[]>(() => rows.map((row) => {
    const minor = (value: string) => value.trim() ? rupeeTextToMinor(value) ?? "INVALID" : "0";
    return {
      lineId: row.id,
      accountId: row.accountId,
      debitMinor: minor(row.debit),
      creditMinor: minor(row.credit),
      ...(row.partyId.trim() ? { partyId: row.partyId.trim() } : {}),
      ...(row.openItemId.trim() ? { openItemId: row.openItemId.trim() } : {}),
      ...(row.stockMovementId.trim() ? { stockMovementId: row.stockMovementId.trim() } : {}),
    };
  }), [rows]);

  const result = useMemo(() => previewJournalDraft({
    organizationId: policy.organizationId,
    currency: policy.currency,
    businessDate: date,
    intentId: "ui-review-only-no-posting",
    lines: draftLines,
  }, policy, accounts), [policy, accounts, date, draftLines]);

  const change = (id: string, key: keyof Omit<DraftRow, "id">, value: string) => {
    setRows((previous) => previous.map((row) => row.id === id ? { ...row, [key]: value } : row));
    setShowIssues(false);
  };

  const append = () => {
    counter.current += 1;
    setRows((previous) => [...previous, blank(counter.current)]);
    setShowIssues(false);
  };

  const clear = () => {
    counter.current = 2;
    setDate(initialDate);
    setRows([blank(1), blank(2)]);
    setShowIssues(false);
  };

  return (
    <section className="aq-finance__section" aria-labelledby="aq-finance-journal-heading">
      <header className="aq-finance__section-header">
        <div>
          <span className="aq-finance__eyebrow">PROFESSIONAL ENTRY</span>
          <h2 id="aq-finance-journal-heading">Journal Entry</h2>
          <p>Compose and check debit/credit lines before secure server review.</p>
        </div>
        <span className="aq-finance__draft-chip">Draft preview only</span>
      </header>

      <div className="aq-finance__panel aq-finance__journal">
        <div className="aq-finance__journal-meta">
          <label>Business date
            <input type="date" value={date} onChange={(event) => { setDate(event.target.value); setShowIssues(false); }} />
          </label>
          <label>Base currency
            <input type="text" value={policy.currency} readOnly aria-label="Base currency" />
          </label>
          <div className="aq-finance__locked-field">
            <span>Voucher number</span><strong>Assigned on secure posting</strong>
          </div>
        </div>
        <div className="aq-finance__table-scroll">
          <table className="aq-finance__table aq-finance__journal-table">
            <thead><tr>
              <th scope="col">#</th><th scope="col">Ledger account</th>
              <th scope="col">Debit (Rs)</th><th scope="col">Credit (Rs)</th>
              <th scope="col"><span className="sr-only">Remove line</span></th>
            </tr></thead>
            <tbody>
              {rows.map((row, index) => {
                const account = accounts.find((a) => a.id === row.accountId);
                const needsParty = account?.controlRole === "receivable" || account?.controlRole === "payable";
                const needsStock = account?.controlRole === "inventory";
                return (
                  <React.Fragment key={row.id}>
                    <tr>
                      <td className="aq-finance__line-number">{String(index + 1).padStart(2, "0")}</td>
                      <td>
                        <label className="sr-only" htmlFor={`account-${row.id}`}>Line {index + 1} account</label>
                        <select id={`account-${row.id}`} value={row.accountId}
                          onChange={(event) => change(row.id, "accountId", event.target.value)}>
                          <option value="">Select account</option>
                          {postable.map((option) => <option key={option.id} value={option.id}>{option.code} · {option.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <label className="sr-only" htmlFor={`debit-${row.id}`}>Line {index + 1} debit in rupees</label>
                        <input id={`debit-${row.id}`} inputMode="decimal" type="text"
                          placeholder="0.00" value={row.debit} onChange={(event) => change(row.id, "debit", event.target.value)} />
                      </td>
                      <td>
                        <label className="sr-only" htmlFor={`credit-${row.id}`}>Line {index + 1} credit in rupees</label>
                        <input id={`credit-${row.id}`} inputMode="decimal" type="text"
                          placeholder="0.00" value={row.credit} onChange={(event) => change(row.id, "credit", event.target.value)} />
                      </td>
                      <td><button type="button" className="aq-finance__icon-button"
                        title="Remove line" aria-label={`Remove line ${index + 1}`} disabled={rows.length <= 2}
                        onClick={() => { setRows((previous) => previous.filter((entry) => entry.id !== row.id)); setShowIssues(false); }}>
                          <Trash2 size={16} aria-hidden="true" /></button></td>
                    </tr>
                    {(needsParty || needsStock) && (
                      <tr className="aq-finance__dimension-row"><td /><td colSpan={4}>
                        <div className="aq-finance__dimensions">
                          {needsParty && <>
                            <label>Party ID<input value={row.partyId} onChange={(event) => change(row.id, "partyId", event.target.value)} placeholder="Verified party ID" /></label>
                            <label>Open item ID<input value={row.openItemId} onChange={(event) => change(row.id, "openItemId", event.target.value)} placeholder="Invoice or bill ID" /></label>
                          </>}
                          {needsStock && <label>Stock movement ID<input value={row.stockMovementId} onChange={(event) => change(row.id, "stockMovementId", event.target.value)} placeholder="Verified stock movement" /></label>}
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="aq-finance__journal-actions">
          <button type="button" className="aq-finance__text-button" onClick={append}><Plus size={16} /> Add line</button>
          <button type="button" className="aq-finance__text-button" onClick={clear}><RotateCcw size={15} /> Clear draft</button>
        </div>
        <div className="aq-finance__totals" aria-label="Journal totals">
          <span>Debit <strong>{formatMinorForPreview(result.debitMinor)}</strong></span>
          <span>Credit <strong>{formatMinorForPreview(result.creditMinor)}</strong></span>
          <span className={result.balanced ? "aq-finance__balanced" : "aq-finance__unbalanced"}>
            <ArrowRightLeft size={15} aria-hidden="true" />
            {result.balanced ? "Balanced" : `Difference ${formatMinorForPreview(result.differenceMinor)}`}
          </span>
        </div>
        <div className="aq-finance__review">
          <button type="button" className="aq-finance__button" onClick={() => setShowIssues(true)}>Review journal</button>
          <button type="button" className="aq-finance__button aq-finance__button--disabled" disabled title="Requires verified secure posting API">
            <LockKeyhole size={16} aria-hidden="true" /> Post journal
          </button>
        </div>
        {showIssues && (
          <div role="status" className="aq-finance__review-result" aria-live="polite">
            {result.canSubmitForServerReview
              ? <p>Local checks passed. The authoritative server preview, role and period checks are not connected yet. No journal was posted.</p>
              : <><strong>Fix these issues before server review:</strong>
                <ul>{result.issues.map((issue, i) => <li key={`${issue.code}-${i}`}>
                  {issue.lineIndex === undefined ? "" : `Line ${issue.lineIndex + 1}: `}{issue.message}
                </li>)}</ul></>}
          </div>
        )}
        <p className="aq-finance__footnote">
          No saving or posting here. A local balanced result never grants authorization to write a financial record.
        </p>
      </div>
    </section>
  );
};
