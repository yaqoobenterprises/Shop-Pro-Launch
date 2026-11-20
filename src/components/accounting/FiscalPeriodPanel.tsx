import React, { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, LockKeyhole, Search, X } from "lucide-react";
import type { AqvoraFiscalPeriod } from "../../services/aqvoraAdminReadService";

type PeriodStatus = "all" | "open" | "closed";
type ReviewAction = "close" | "reopen";
const PAGE_SIZE = 5;

export interface FiscalPeriodPanelProps {
  periods: AqvoraFiscalPeriod[];
  source: "illustrative" | "authenticated-admin-rpc";
  hasMoreOnServer?: boolean;
}

const displayDate = (value: string) => {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
};

/**
 * Read-only administration surface. Review dialogs document intent but never
 * send a mutation; server authorisation + staging gates are still pending.
 */
export const FiscalPeriodPanel: React.FC<FiscalPeriodPanelProps> = ({
  periods, source, hasMoreOnServer = false,
}) => {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PeriodStatus>("all");
  const [page, setPage] = useState(0);
  const [review, setReview] = useState<{ period: AqvoraFiscalPeriod; action: ReviewAction } | null>(null);
  const [detail, setDetail] = useState<AqvoraFiscalPeriod | null>(null);
  const isSample = source === "illustrative";

  const rows = useMemo(() => periods
    .filter((p) => status === "all" || p.state === status)
    .filter((p) => `${p.startsOn} ${p.endsOn} ${p.state}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn)), [periods, status, search]);
  const maxPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, maxPage);
  const visible = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const openCount = periods.filter((p) => p.state === "open").length;
  const closedCount = periods.filter((p) => p.state === "closed").length;

  return <section className="aq-finance__section" aria-labelledby="aq-fiscal-heading">
    <header className="aq-finance__section-header">
      <div>
        <span className="aq-finance__eyebrow">ACCOUNTING / PERIOD CONTROLS</span>
        <h2 id="aq-fiscal-heading">Fiscal Periods</h2>
        <p>Review period availability, closure history and controlled change requirements.</p>
      </div>
      <button type="button" className="aq-finance__button aq-finance__button--disabled" disabled
        title="Creating a real fiscal period is blocked pending verified staging and owner permissions">
        <LockKeyhole size={15} aria-hidden="true" /> Create period
      </button>
    </header>

    <div className="aq-finance__stats" aria-label="Fiscal periods overview">
      <div className="aq-finance__stat aq-finance__stat--charcoal"><span>Periods loaded</span>
        <strong>{periods.length}{hasMoreOnServer ? "+" : ""}</strong><small>{isSample ? "Illustrative only" : "Authorized RPC page"}</small></div>
      <div className="aq-finance__stat aq-finance__stat--mint"><span>Open periods</span>
        <strong>{openCount}</strong><small>{hasMoreOnServer ? "Loaded page only" : "In loaded set"}</small></div>
      <div className="aq-finance__stat aq-finance__stat--blush"><span>Closed periods</span>
        <strong>{closedCount}</strong><small>Read-only view</small></div>
    </div>

    <div className="aq-finance__panel">
      <div className="aq-finance__filters">
        <label className="aq-finance__search"><Search size={16} aria-hidden="true" />
          <span className="sr-only">Search fiscal periods</span>
          <input type="search" value={search} placeholder="Search dates or status"
            onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </label>
        <label className="aq-finance__select"><span className="sr-only">Filter fiscal period status</span>
          <select value={status} onChange={(e) => { setStatus(e.target.value as PeriodStatus); setPage(0); }}>
            <option value="all">All statuses</option><option value="open">Open</option><option value="closed">Closed</option>
          </select>
        </label>
      </div>
      <div className="aq-finance__table-scroll">
        <table className="aq-finance__table">
          <thead><tr><th scope="col">Date range</th><th scope="col">Status</th>
            <th scope="col">Reopens</th><th scope="col">Revision</th><th scope="col">Review</th></tr></thead>
          <tbody>
            {visible.map((p) => <tr key={p.id}>
              <td><strong>{displayDate(p.startsOn)} – {displayDate(p.endsOn)}</strong></td>
              <td><span className={p.state === "open" ? "aq-finance__status" : "aq-finance__status aq-finance__status--muted"}>
                {p.state === "open" ? "Open" : "Closed"}</span></td>
              <td>{p.reopenCount}</td><td className="aq-finance__revision">{p.revision}</td>
              <td><div className="aq-admin__row-actions">
                <button type="button" className="aq-admin__link" onClick={() => setDetail(p)}
                  aria-label={`View period ${p.startsOn}`}>Details</button>
                <button type="button" className="aq-admin__link" onClick={() => setReview({
                  period: p, action: p.state === "open" ? "close" : "reopen",
                })} aria-label={`Preview ${p.state === "open" ? "close" : "reopen"} period ${p.startsOn}`}>
                  Review {p.state === "open" ? "close" : "reopen"}
                </button>
              </div></td>
            </tr>)}
            {visible.length === 0 && <tr><td colSpan={5} className="aq-finance__no-results">
              {periods.length ? "No fiscal periods match these filters." : "No authorized fiscal periods are available."}
            </td></tr>}
          </tbody>
        </table>
      </div>
      <footer className="aq-finance__table-foot aq-admin__pagination">
        <span>{visible.length ? currentPage * PAGE_SIZE + 1 : 0}–{Math.min((currentPage + 1) * PAGE_SIZE, rows.length)} of {rows.length} loaded
          {hasMoreOnServer ? " · More on server (not loaded)" : ""}</span>
        <div className="aq-admin__page-controls">
          <button type="button" onClick={() => setPage((n) => Math.max(0, n - 1))}
            disabled={currentPage === 0} aria-label="Previous fiscal period page"><ChevronLeft size={17}/></button>
          <span>Page {currentPage + 1} of {maxPage + 1}</span>
          <button type="button" onClick={() => setPage((n) => Math.min(maxPage, n + 1))}
            disabled={currentPage === maxPage} aria-label="Next fiscal period page"><ChevronRight size={17}/></button>
        </div>
      </footer>
    </div>
    <p className="aq-admin__source"><CalendarDays size={15} aria-hidden="true"/>
      {isSample ? "Illustrative sample periods. No company data is loaded." :
        "Authenticated company read · figures apply to loaded rows only."}
    </p>

    {detail && <div className="aq-admin__backdrop" onClick={() => setDetail(null)}>
      <div className="aq-admin__modal" role="dialog" aria-modal="true" aria-labelledby="aq-period-detail"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setDetail(null); } }}>
        <button type="button" className="aq-admin__modal-close" aria-label="Close period details"
          onClick={() => setDetail(null)}><X size={19}/></button>
        <h3 id="aq-period-detail">Fiscal period details</h3>
        <dl><dt>Start</dt><dd>{detail.startsOn}</dd><dt>End</dt><dd>{detail.endsOn}</dd>
          <dt>State</dt><dd>{detail.state}</dd><dt>Reopen count</dt><dd>{detail.reopenCount}</dd>
          <dt>Revision (exact)</dt><dd className="aq-finance__revision">{detail.revision}</dd></dl>
        <button type="button" autoFocus className="aq-admin__modal-action" onClick={() => setDetail(null)}>Done</button>
      </div>
    </div>}

    {review && <div className="aq-admin__backdrop" onClick={() => setReview(null)}>
      <div className="aq-admin__modal" role="dialog" aria-modal="true" aria-labelledby="aq-period-review"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setReview(null); } }}>
        <button type="button" className="aq-admin__modal-close" aria-label="Cancel period review"
          onClick={() => setReview(null)}><X size={19}/></button>
        <span className="aq-finance__eyebrow">NO FINANCIAL WRITE</span>
        <h3 id="aq-period-review">Review {review.action} period</h3>
        <p>{displayDate(review.period.startsOn)} – {displayDate(review.period.endsOn)}</p>
        <p>Closing or reopening a period requires verified OWNER membership, live AAL2 MFA,
          a reason and server-side revision checks. This screen does not submit changes.</p>
        <div className="aq-admin__modal-footer">
          <button type="button" autoFocus className="aq-admin__modal-action"
            onClick={() => setReview(null)}>Cancel</button>
          <button type="button" className="aq-finance__button aq-finance__button--disabled" disabled>
            Confirm {review.action} (unavailable)
          </button>
        </div>
      </div>
    </div>}
  </section>;
};
