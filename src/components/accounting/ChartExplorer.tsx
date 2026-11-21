import React, { useMemo, useState } from "react";
import { Search, SlidersHorizontal, LockKeyhole } from "lucide-react";
import type { ChartAccount, AccountClass } from "../../accounting/types";

const names: Record<AccountClass, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  cost_of_sales: "Cost of sales",
  expense: "Expenses",
  other_income: "Other income",
  other_expense: "Other expenses",
};

interface Props {
  accounts: ChartAccount[];
  isSample: boolean;
}

export const ChartExplorer: React.FC<Props> = ({ accounts, isSample }) => {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const groups = useMemo(() => Array.from(new Set(accounts.map((a) => a.accountClass))), [accounts]);
  const rows = useMemo(() => accounts
    .filter((a) => group === "all" || a.accountClass === group)
    .filter((a) => `${a.code} ${a.name} ${names[a.accountClass]}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.code.localeCompare(b.code)), [accounts, group, search]);
  const activeCount = accounts.filter((a) => a.isActive && a.isPosting).length;

  return (
    <section className="aq-finance__section" aria-labelledby="aq-finance-coa-heading">
      <header className="aq-finance__section-header">
        <div>
          <span className="aq-finance__eyebrow">ACCOUNTING STRUCTURE</span>
          <h2 id="aq-finance-coa-heading">Chart of Accounts</h2>
          <p>Structured codes, account classes and posting controls.</p>
        </div>
        <button type="button" className="aq-finance__button aq-finance__button--disabled" disabled
          title="Account creation requires verified finance permissions and the secure server writer">
          <LockKeyhole size={15} aria-hidden="true" /> Add account
        </button>
      </header>

      <div className="aq-finance__stats" aria-label="Chart overview">
        <div className="aq-finance__stat aq-finance__stat--charcoal">
          <span>Total accounts</span><strong>{accounts.length}</strong><small>{isSample ? "Illustrative chart" : "Loaded chart"}</small>
        </div>
        <div className="aq-finance__stat aq-finance__stat--mint">
          <span>Active posting leaves</span><strong>{activeCount}</strong><small>Available for drafts</small>
        </div>
        <div className="aq-finance__stat aq-finance__stat--blush">
          <span>Account classes</span><strong>{groups.length}</strong><small>Organized by type</small>
        </div>
      </div>

      <div className="aq-finance__panel">
        <div className="aq-finance__filters">
          <label className="aq-finance__search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search chart of accounts</span>
            <input type="search" value={search} placeholder="Search code or name"
              onChange={(event) => setSearch(event.target.value)} />
          </label>
          <label className="aq-finance__select">
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span className="sr-only">Filter account class</span>
            <select value={group} onChange={(event) => setGroup(event.target.value)}>
              <option value="all">All classes</option>
              {groups.map((g) => <option key={g} value={g}>{names[g]}</option>)}
            </select>
          </label>
        </div>

        <div className="aq-finance__table-scroll">
          <table className="aq-finance__table">
            <thead><tr>
              <th scope="col">Code</th><th scope="col">Account name</th>
              <th scope="col">Class</th><th scope="col">Normal</th>
              <th scope="col">Status</th>
            </tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td><span className="aq-finance__code">{a.code}</span></td>
                  <td><strong>{a.name}</strong>{a.controlRole && <small className="aq-finance__meta">Control: {a.controlRole}</small>}</td>
                  <td>{names[a.accountClass]}</td><td>{a.normalSide === "debit" ? "Debit" : "Credit"}</td>
                  <td><span className={a.isActive && a.isPosting ? "aq-finance__status" : "aq-finance__status aq-finance__status--muted"}>
                    {a.isActive ? a.isPosting ? "Active" : "Heading" : "Inactive"}</span></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="aq-finance__no-results">
                  {accounts.length ? "No accounts match these filters." : "No chart is available from an authorized company book."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="aq-finance__table-foot">
          <span>{rows.length} of {accounts.length} accounts</span>
          <span>Account management opens after backend authorization review</span>
        </div>
      </div>
    </section>
  );
};
