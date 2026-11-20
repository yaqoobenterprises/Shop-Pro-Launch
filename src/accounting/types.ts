/**
 * AQVORA V2 accounting domain — exact decimal minor-unit strings on all external boundaries.
 * This module is intentionally NOT connected to the legacy cashbook writer or a database.
 */
export type AccountClass =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "cost_of_sales"
  | "expense"
  | "other_income"
  | "other_expense";

export type AccountSide = "debit" | "credit";
export type ControlRole = "cash" | "receivable" | "payable" | "inventory" | "tax";

export interface ChartAccount {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  accountClass: AccountClass;
  normalSide: AccountSide;
  parentId: string | null;
  isPosting: boolean;
  isActive: boolean;
  controlRole?: ControlRole;
}

export interface JournalLineInput {
  lineId: string;
  accountId: string;
  debitMinor: string;
  creditMinor: string;
  partyId?: string;
  openItemId?: string;
  stockMovementId?: string;
}

export interface JournalDraftInput {
  organizationId: string;
  currency: string;
  businessDate: string;
  intentId: string;
  lines: JournalLineInput[];
}

export interface JournalPreviewPolicy {
  organizationId: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  periodState: "open" | "closed" | "reopened";
}

export interface JournalIssue {
  code: string;
  message: string;
  lineIndex?: number;
}

export interface JournalPreview {
  debitMinor: string;
  creditMinor: string;
  differenceMinor: string;
  balanced: boolean;
  canSubmitForServerReview: boolean;
  issues: JournalIssue[];
}

/** Read model inputs must come from an authorized, complete server snapshot. */
export interface PostedJournal {
  id: string;
  organizationId: string;
  intentId: string;
  currency: string;
  businessDate: string;
  status: "posted";
  lines: JournalLineInput[];
}

export interface AccountingSnapshotInput {
  organizationId: string;
  currency: string;
  asOfDate: string;
  sourceComplete: boolean;
  accounts: ChartAccount[];
  journals: PostedJournal[];
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  accountClass: AccountClass;
  totalDebitMinor: string;
  totalCreditMinor: string;
  closingDebitMinor: string;
  closingCreditMinor: string;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebitMinor: string;
  totalCreditMinor: string;
  closingDebitMinor: string;
  closingCreditMinor: string;
}

export interface FinancialSnapshot {
  organizationId: string;
  currency: string;
  asOfDate: string;
  trialBalance: TrialBalance;
  incomeStatement: {
    revenueMinor: string;
    costOfSalesMinor: string;
    expensesMinor: string;
    otherIncomeMinor: string;
    otherExpensesMinor: string;
    netEarningsMinor: string;
  };
  balanceSheet: {
    assetsMinor: string;
    liabilitiesMinor: string;
    recordedEquityMinor: string;
    unclosedEarningsMinor: string;
    totalEquityMinor: string;
    differenceMinor: string;
  };
}
