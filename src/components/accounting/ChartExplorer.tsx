import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LockKeyhole, Search, SlidersHorizontal, X } from "lucide-react";
import type { ChartAccount, AccountClass } from "../../accounting/types";

const names: Record<AccountClass, string> = {
  asset: "Assets", liability: "Liabilities", equity: "Equity",
  revenue: "Revenue", cost_of_sales: "Cost of sales", expense: "Expenses",
  other_income: "Other income", other_expense: "Other expenses",
};
const PAGE_SIZE = 5;
type Status = "all" | "active" | "heading" | "inactive";

interface Props {
  accounts: ChartAccount[];
  isSample: boolean;
  /** True means the loaded RPC page is not the full company chart. */
  hasMoreOnServer?: boolean;
}

export const ChartExplorer: React.FC<Props> = ({ accounts, isSample, hasMoreOnServer = false }) => {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [status, setStatus] = useState<Status>("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ChartAccount | null>(null);
  const [review, setReview] = useState<"edit" | "archive" | null>(null);
  const groups = useMemo(() => Array.from(new Set(accounts.map((a) => a.accountClass))), [accounts]);
  const rows = useMemo(() => accounts
    .filter((a) => group === "all" || a.accountClass === group)
    .filter((a) => status === "all" ||
      (status === "active" && a.isActive && a.isPosting) ||
      (status === "heading" && a.isActive && !a.isPosting) ||
      (status === "inactive" && !a.isActive))
    .filter((a) => `${a.code} ${a.name} ${names[a.accountClass]}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.code.localeCompare(b.code)), [accounts, group, search, status]);
  const maxPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, maxPage);
  const visible = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const activeCount = accounts.filter((a) => a.isActive && a.isPosting).length;
  const clearSelection = () => { setSelected(null); setReview(null); };

  return (
    <section className="aq-finance__section" aria-labelledby="aq-finance-coa-heading">
      <header className="aq-finance__section-header">
        <div>
          <span className="aq-finance__eyebrow">ACCOUNTING STRUCTURE</span>
          <h2 id="aq-finance-coa-heading">Chart of Accounts</h2>
          <p>Browse account codes, classes, controls and posting availability.</p>
        </div>
        <button type="button" className="aq-finance__button aq-finance__button--disabled" disabled
          title="Account creation requires verified owner permissions and isolated staging">
          <LockKeyhole size={15} aria-hidden="true" /> Add account
        </button>
      </header>

      <div className="aq-finance__stats" aria-label="Chart overview">
        <div className="aq-finance__stat aq-finance__stat--charcoal">
          <span>Accounts loaded</span><strong>{accounts.length}{hasMoreOnServer ? "+" : ""}</strong>
          <small>{isSample ? "Illustrative chart" : hasMoreOnServer ? "Partial authorized page" : "Loaded chart"}</small>
        </div>
        <div className="aq-finance__stat aq-finance__stat--mint">
          <span>Active posting leaves</span><strong>{activeCount}</strong><small>Loaded rows only</small>
        </div>
        <div className="aq-finance__stat aq-finance__stat--blush">
          <span>Account classes</span><strong>{groups.length}</strong><small>In loaded rows</small>
        </div>
      </div>

      <div className="aq-finance__panel">
        <div className="aq-finance__filters">
          <label className="aq-finance__search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search chart of accounts</span>
            <input type="search" value={search} placeholder="Search code or name"
              onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
          </label>
          <label className="aq-finance__select">
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span className="sr-only">Filter account class</span>
            <select value={group} onChange={(event) => { setGroup(event.target.value); setPage(0); }}>
              <option value="all">All classes</option>
              {groups.map((g) => <option key={g} value={g}>{names[g]}</option>)}
            </select>
          </label>
          <label className="aq-finance__select">
            <span className="sr-only">Filter account status</span>
            <select value={status} onChange={(event) => { setStatus(event.target.value as Status); setPage(0); }}>
              <option value="all">All statuses</option>
              <option value="active">Active posting</option>
              <option value="heading">Headings</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>

        <div className="aq-finance__table-scroll">
          <table className="aq-finance__table">
            <thead><tr>
              <th scope="col">Code</th><th scope="col">Account name</th>
              <th scope="col">Class</th><th scope="col">Normal</th>
              <th scope="col">Status</th><th scope="col">Review</th>
            </tr></thead>
            <tbody>
              {visible.map((a) => (
                <tr key={a.id}>
                  <td><span className="aq-finance__code">{a.code}</span></td>
                  <td><strong>{a.name}</strong>
                    {a.controlRole && <small className="aq-finance__meta">Control: {a.controlRole}</small>}
                  </td>
                  <td>{names[a.accountClass]}</td>
                  <td>{a.normalSide === "debit" ? "Debit" : "Credit"}</td>
                  <td><span className={a.isActive && a.isPosting ? "aq-finance__status" : "aq-finance__status aq-finance__status--muted"}>
                    {a.isActive ? a.isPosting ? "Active" : "Heading" : "Inactive"}</span></td>
                  <td><button type="button" className="aq-admin__link"
                    onClick={() => { setSelected(a); setReview(null); }}
                    aria-label={`View account ${a.code}`}>Details</button></td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={6} className="aq-finance__no-results">
                  {accounts.length ? "No accounts match these filters." : "No chart is available from an authorized company book."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="aq-finance__table-foot aq-admin__pagination">
          <span>{visible.length ? currentPage * PAGE_SIZE + 1 : 0}–{Math.min((currentPage + 1) * PAGE_SIZE, rows.length)} of {rows.length} loaded
            {hasMoreOnServer ? " · Additional server pages not loaded" : ""}</span>
          <div className="aq-admin__page-controls">
            <button type="button" aria-label="Previous account page" disabled={currentPage === 0}
              onClick={() => setPage((n) => Math.max(0, n - 1))}><ChevronLeft size={17}/></button>
            <span>Page {currentPage + 1} of {maxPage + 1}</span>
            <button type="button" aria-label="Next account page" disabled={currentPage === maxPage}
              onClick={() => setPage((n) => Math.min(maxPage, n + 1))}><ChevronRight size={17}/></button>
          </div>
        </footer>
      </div>

      <p className="aq-admin__source">
        {isSample ? "Illustrative sample chart · no live company accounts." :
          "Authenticated company read · completeness is limited to retrieved rows."}
      </p>

      {selected && <div className="aq-admin__backdrop" onClick={clearSelection}>
        <div className="aq-admin__modal" role="dialog" aria-modal="true" aria-labelledby="aq-account-details"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); clearSelection(); } }}>
          <button type="button" className="aq-admin__modal-close" aria-label="Close account details"
            onClick={clearSelection}><X size={19}/></button>
          <span className="aq-finance__eyebrow">{isSample ? "SAMPLE ACCOUNT" : "ACCOUNT DETAILS"}</span>
          <h3 id="aq-account-details">{selected.code} · {selected.name}</h3>
          <dl><dt>Class</dt><dd>{names[selected.accountClass]}</dd>
            <dt>Normal balance</dt><dd>{selected.normalSide}</dd>
            <dt>Posting type</dt><dd>{selected.isPosting ? "Posting account" : "Heading"}</dd>
            <dt>Status</dt><dd>{selected.isActive ? "Active" : "Inactive"}</dd>
            <dt>Control role</dt><dd>{selected.controlRole ?? "None"}</dd>
            <dt>Parent</dt><dd>{selected.parentId ?? "Root"}</dd>
          </dl>
          {review ? <div role="status">
            <p>Preview {review} only. OWNER AAL2, reason where required and the server revision check
              must be independently verified before writes become available. Nothing was changed.</p>
            <button type="button" className="aq-finance__button aq-finance__button--disabled" disabled>
              Confirm {review} (unavailable)
            </button>
          </div> : <p>Account changes are not available until isolated staging is certified.</p>}
          <div className="aq-admin__modal-footer">
            <button type="button" autoFocus className="aq-admin__modal-action"
              onClick={clearSelection}>Done</button>
            <button type="button" className="aq-admin__modal-action"
              onClick={() => setReview("edit")}>Review edit</button>
            {selected.isActive && <button type="button" className="aq-admin__modal-action"
              onClick={() => setReview("archive")}>Review archive</button>}
          </div>
        </div>
      </div>}
    </section>
  );
};
