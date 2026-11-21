import type { ChartAccount, PostedJournal } from "../../accounting/types";

const org = "aqvora-sample-only";
const account = (
  code: string,
  name: string,
  accountClass: ChartAccount["accountClass"],
  normalSide: ChartAccount["normalSide"],
  extra: Partial<ChartAccount> = {},
): ChartAccount => ({
  id: code,
  organizationId: org,
  code,
  name,
  accountClass,
  normalSide,
  parentId: null,
  isPosting: true,
  isActive: true,
  ...extra,
});

/** Deliberately illustrative, balanced mini-book. Never send to Supabase or the cashbook. */
export const sampleChart: ChartAccount[] = [
  account("1010", "Cash in hand", "asset", "debit", { controlRole: "cash" }),
  account("1020", "Bank accounts", "asset", "debit", { controlRole: "cash" }),
  account("1100", "Trade receivables", "asset", "debit", { controlRole: "receivable" }),
  account("1200", "Goods inventory", "asset", "debit", { controlRole: "inventory" }),
  account("2010", "Trade payables", "liability", "credit", { controlRole: "payable" }),
  account("3010", "Owner capital", "equity", "credit"),
  account("3020", "Owner drawings", "equity", "debit"),
  account("4010", "Sales revenue", "revenue", "credit"),
  account("4020", "Service revenue", "revenue", "credit"),
  account("5010", "Cost of goods sold", "cost_of_sales", "debit"),
  account("6010", "Rent", "expense", "debit"),
  account("6020", "Utilities", "expense", "debit"),
];

const entry = (
  id: string,
  businessDate: string,
  debitAccount: string,
  creditAccount: string,
  minor: string,
): PostedJournal => ({
  id,
  intentId: `sample-${id}`,
  organizationId: org,
  currency: "PKR",
  businessDate,
  status: "posted",
  lines: [
    { lineId: `${id}-dr`, accountId: debitAccount, debitMinor: minor, creditMinor: "0" },
    { lineId: `${id}-cr`, accountId: creditAccount, debitMinor: "0", creditMinor: minor },
  ],
});

export const sampleJournals: PostedJournal[] = [
  entry("JV-S001", "2026-11-01", "1010", "3010", "5000000"),
  entry("JV-S002", "2026-11-02", "1010", "4020", "1200000"),
  entry("JV-S003", "2026-11-03", "6020", "1010", "300000"),
];

export const sampleCompany = {
  organizationId: org,
  currency: "PKR",
  asOfDate: "2026-11-20",
  sourceComplete: true,
  accounts: sampleChart,
  journals: sampleJournals,
} as const;
