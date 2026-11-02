import React from "react";
import { DatePicker } from "../common/DatePicker";
import { MonthPicker } from "../common/MonthPicker";
import type { LedgerAccount, Transaction } from "../../types/ledger";

export type OverviewPeriod = "day" | "week" | "month" | "custom";
type OverviewTransactionType = "all" | Transaction["type"];

interface OverviewPeriodControlsProps {
  period: OverviewPeriod;
  setPeriod: (period: OverviewPeriod) => void;
  currentDate: string;
  setCurrentDate: (value: string) => void;
  rangeStart: string;
  setRangeStart: (value: string) => void;
  rangeEnd: string;
  setRangeEnd: (value: string) => void;
  today: string;
  accounts: LedgerAccount[];
  accountId: string;
  setAccountId: (value: string) => void;
  transactionType: OverviewTransactionType;
  setTransactionType: (value: OverviewTransactionType) => void;
}

export const OverviewPeriodControls: React.FC<OverviewPeriodControlsProps> = ({
  period,
  setPeriod,
  currentDate,
  setCurrentDate,
  rangeStart,
  setRangeStart,
  rangeEnd,
  setRangeEnd,
  today,
  accounts,
  accountId,
  setAccountId,
  transactionType,
  setTransactionType,
}) => (
  <div className="title-actions overview-filter-controls">
    <div className="overview-period-toggle" role="group" aria-label="Overview period">
      {([
        ["day", "Day"],
        ["week", "Week"],
        ["month", "Month"],
        ["custom", "Custom"],
      ] as const).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={period === value}
          className={`button overview-period-option ${period === value ? "button-primary" : "button-secondary"}`}
          onClick={() => setPeriod(value)}
        >
          {label}
        </button>
      ))}
    </div>

    <div className="overview-scope-controls">
      <label>
        <span>Account</span>
        <select className="workspace-control" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          <option value="all">All active accounts</option>
          {accounts.filter((account) => account.is_active).map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Transaction type</span>
        <select
          className="workspace-control"
          value={transactionType}
          onChange={(event) => setTransactionType(event.target.value as OverviewTransactionType)}
        >
          <option value="all">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expenses</option>
          <option value="capital_in">Capital introduced</option>
          <option value="withdrawal">Owner drawings</option>
          <option value="adjustment">Cash adjustments</option>
        </select>
      </label>
    </div>
    <div className="overview-period-picker">
      {period === "month" ? (
        <MonthPicker
          value={currentDate.slice(0, 7)}
          onChange={setCurrentDate}
          ariaLabel="Filter month"
          className="w-full"
        />
      ) : period === "custom" ? (
        <div className="overview-range-picker">
          <label>
            <span>From</span>
            <DatePicker value={rangeStart} onChange={setRangeStart} ariaLabel="Overview start date" max={rangeEnd} className="w-full" />
          </label>
          <label>
            <span>To</span>
            <DatePicker value={rangeEnd} onChange={setRangeEnd} ariaLabel="Overview end date" min={rangeStart} max={today} className="w-full" />
          </label>
        </div>
      ) : (
        <DatePicker
          value={currentDate}
          onChange={setCurrentDate}
          ariaLabel={period === "week" ? "Choose a date in the week" : "Filter date"}
          max={today}
          className="w-full"
        />
      )}
    </div>
  </div>
);
