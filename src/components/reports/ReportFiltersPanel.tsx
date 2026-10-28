import React, { useEffect, useState } from "react";
import { CalendarDays, Filter, RotateCcw } from "lucide-react";
import { DatePicker } from "../common/DatePicker";
import type { Category, TransactionType } from "../../types/ledger";
import { formatDisplayDate } from "../../lib/dates";

export type ReportTypeFilter = "all" | TransactionType;

export interface ReportFilters {
  fromDate: string;
  toDate: string;
  type: ReportTypeFilter;
  categoryId: string;
}

interface ReportFiltersPanelProps {
  filters: ReportFilters;
  categories: Category[];
  today: string;
  isLoading: boolean;
  onApply: (filters: ReportFilters) => void;
}

const types: Array<{ value: ReportTypeFilter; label: string }> = [
  { value: "all", label: "All transaction types" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expenses" },
  { value: "capital_in", label: "Capital introduced" },
  { value: "withdrawal", label: "Owner drawings" },
  { value: "adjustment", label: "Cash adjustments" },
];

const dateDaysAgo = (date: string, days: number): string => {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day));
  result.setUTCDate(result.getUTCDate() - days);
  return result.toISOString().slice(0, 10);
};

export const ReportFiltersPanel: React.FC<ReportFiltersPanelProps> = ({
  filters,
  categories,
  today,
  isLoading,
  onApply,
}) => {
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const [fromDate, setFromDate] = useState(filters.fromDate);
  const [toDate, setToDate] = useState(filters.toDate);
  const [typeFilter, setTypeFilter] = useState<ReportTypeFilter>(filters.type);
  const [categoryFilter, setCategoryFilter] = useState(filters.categoryId);
  const [filterError, setFilterError] = useState<string | null>(null);

  useEffect(() => {
    setFromDate(filters.fromDate);
    setToDate(filters.toDate);
    setTypeFilter(filters.type);
    setCategoryFilter(filters.categoryId);
  }, [filters]);

  const matchingCategories = categories.filter((category) =>
    typeFilter === "all" ||
    typeFilter === "capital_in" ||
    typeFilter === "withdrawal" ||
    typeFilter === "adjustment" ||
    category.kind === typeFilter,
  );

  const applyRange = (start: string, end: string) => {
    setFromDate(start);
    setToDate(end);
    setFilterError(null);
    onApply({ fromDate: start, toDate: end, type: typeFilter, categoryId: categoryFilter });
  };

  const applyFilters = () => {
    if (!fromDate || !toDate) {
      setFilterError("Please select both a start and end date.");
      return;
    }
    if (fromDate > toDate) {
      setFilterError("The start date must be on or before the end date.");
      return;
    }
    setFilterError(null);
    onApply({ fromDate, toDate, type: typeFilter, categoryId: categoryFilter });
  };

  return (
    <section className="reports-modern__filters" aria-label="Report filters">
      <div className="reports-modern__filter-heading">
        <div className="reports-modern__filter-title"><Filter size={17} aria-hidden="true" /><h2>Build your report</h2></div>
        <span className="reports-modern__filter-note">Every chart and total uses the selected filters</span>
      </div>
      <div className="reports-modern__presets" role="group" aria-label="Quick date ranges">
        <button type="button" onClick={() => applyRange(dateDaysAgo(today, 6), today)}>Last 7 days</button>
        <button type="button" onClick={() => applyRange(dateDaysAgo(today, 29), today)}>Last 30 days</button>
        <button type="button" onClick={() => applyRange(`${today.slice(0, 7)}-01`, today)}>This month</button>
        <button type="button" onClick={() => applyRange(yearStart, today)}>Year to date</button>
      </div>
      <div className="reports-modern__filter-grid">
        <label className="reports-modern__field">
          <span>From date</span>
          <DatePicker value={fromDate} onChange={setFromDate} ariaLabel="Report start date" max={toDate || today} className="w-full" />
        </label>
        <label className="reports-modern__field">
          <span>To date</span>
          <DatePicker value={toDate} onChange={setToDate} ariaLabel="Report end date" min={fromDate} max={today} className="w-full" />
        </label>
        <label className="reports-modern__field">
          <span>Transaction type</span>
          <select value={typeFilter} onChange={(event) => {
            setTypeFilter(event.target.value as ReportTypeFilter);
            setCategoryFilter("all");
          }} className="workspace-control w-full">
            {types.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="reports-modern__field">
          <span>Category</span>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="workspace-control w-full">
            <option value="all">All categories</option>
            {matchingCategories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
          </select>
        </label>
        <div className="reports-modern__filter-actions">
          <button type="button" className="reports-modern__apply" onClick={applyFilters} disabled={isLoading}>
            <Filter size={15} aria-hidden="true" /> Apply filters
          </button>
          <button type="button" className="reports-modern__reset" onClick={() => {
            setFromDate(yearStart);
            setToDate(today);
            setTypeFilter("all");
            setCategoryFilter("all");
            setFilterError(null);
            onApply({ fromDate: yearStart, toDate: today, type: "all", categoryId: "all" });
          }}>
            <RotateCcw size={15} aria-hidden="true" /> Reset
          </button>
        </div>
      </div>
      {filterError && <p role="alert" className="reports-modern__error">{filterError}</p>}
      <div className="reports-modern__active-range">
        <CalendarDays size={15} aria-hidden="true" />
        <strong>{formatDisplayDate(filters.fromDate)} – {formatDisplayDate(filters.toDate)}</strong>
        <span>{filters.type === "all" ? "All transaction types" : types.find((item) => item.value === filters.type)?.label}</span>
        <span>{filters.categoryId === "all" ? "All categories" : categories.find((item) => item.id === filters.categoryId)?.name}</span>
      </div>
    </section>
  );
};
