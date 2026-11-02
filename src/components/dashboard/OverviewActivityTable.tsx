import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowDownUp, ArrowUp, Search } from "lucide-react";
import type { Transaction } from "../../types/ledger";
import { formatDisplayDate } from "../../lib/dates";
import { formatPaisa } from "../../lib/money";

type SortKey = "date" | "type" | "description" | "amount";
type SortDirection = "asc" | "desc";

interface OverviewActivityTableProps {
  transactions: Transaction[];
  isLoading: boolean;
}

export const OverviewActivityTable: React.FC<OverviewActivityTableProps> = ({
  transactions,
  isLoading,
}) => {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return transactions.filter((item) => !query || [
      item.raw_text,
      item.note || "",
      item.category_name || "",
      item.account_name || "",
      item.type,
    ].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [transactions, search]);

  const sorted = useMemo(() => [...filtered].sort((left, right) => {
    const comparison = sortKey === "date"
      ? left.business_date.localeCompare(right.business_date)
        || left.device_entry_time.localeCompare(right.device_entry_time)
      : sortKey === "type"
        ? left.type.localeCompare(right.type)
        : sortKey === "description"
          ? (left.raw_text || "").localeCompare(right.raw_text || "")
          : Number(left.amount_paisa) - Number(right.amount_paisa);
    return sortDirection === "asc" ? comparison : -comparison;
  }), [filtered, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = sorted.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  const start = sorted.length === 0 ? 0 : currentPage * pageSize + 1;
  const end = Math.min(sorted.length, (currentPage + 1) * pageSize);

  const sort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection(key === "date" || key === "amount" ? "desc" : "asc");
    }
    setPage(0);
  };

  const sortIcon = (key: SortKey) => sortKey !== key
    ? <ArrowDownUp size={13} aria-hidden="true" />
    : sortDirection === "asc"
      ? <ArrowUp size={13} aria-hidden="true" />
      : <ArrowDown size={13} aria-hidden="true" />;

  const header = (key: SortKey, label: string) => (
    <button
      type="button"
      className="overview-activity-sort"
      onClick={() => sort(key)}
      aria-label={`Sort by ${label.toLocaleLowerCase()}`}
      aria-pressed={sortKey === key}
    >
      {label}{sortIcon(key)}
    </button>
  );

  return (
    <section className="panel overview-activity" aria-labelledby="overview-activity-title" aria-busy={isLoading}>
      <div className="panel-heading overview-activity__heading">
        <div>
          <h2 id="overview-activity-title">Transaction activity</h2>
          <p className="overview-activity__subheading">Search, sort and review entries in the selected period</p>
        </div>
        <label className="overview-activity__search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search transactions</span>
          <input
            type="search"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(0); }}
            placeholder="Search activity"
          />
        </label>
      </div>

      {isLoading ? (
        <div role="status" className="overview-activity__empty">Loading transaction activity…</div>
      ) : rows.length === 0 ? (
        <div className="overview-activity__empty">
          {search ? "No transactions match your search." : "No active transactions in this period."}
        </div>
      ) : (
        <>
          <div className="overview-activity__scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">{header("date", "Date")}</th>
                  <th scope="col">{header("type", "Type")}</th>
                  <th scope="col">{header("description", "Description")}</th>
                  <th scope="col">Account</th>
                  <th scope="col" className="is-numeric">{header("amount", "Amount")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td className="overview-activity__date">{formatDisplayDate(item.business_date)}</td>
                    <td><span className={`overview-activity__type type-${item.type}`}>{item.type.replace("_", " ")}</span></td>
                    <td className="overview-activity__description" title={item.raw_text || item.note || ""}>
                      <strong>{item.raw_text || item.note || "—"}</strong>
                      {item.category_name && <small>{item.category_name}</small>}
                    </td>
                    <td>{item.account_name || "Cash In Hand"}</td>
                    <td className={`is-numeric ${item.type === "income" ? "amount-income" : item.type === "expense" ? "amount-expense" : ""}`}>
                      {formatPaisa(item.amount_paisa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overview-activity__footer">
            <span>Showing {start.toLocaleString()}–{end.toLocaleString()} of {sorted.length.toLocaleString()} entries</span>
            <div className="overview-activity__pagination">
              <label>
                <span>Rows</span>
                <select
                  value={pageSize}
                  onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }}
                  aria-label="Rows per page"
                >
                  {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={currentPage === 0}>Previous</button>
              <span>Page {currentPage + 1} of {pageCount}</span>
              <button type="button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={currentPage >= pageCount - 1}>Next</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
};
