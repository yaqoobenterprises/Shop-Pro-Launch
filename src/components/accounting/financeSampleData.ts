import type { ChartAccount, PostedJournal } from "../../accounting/types";
import {sampleInvoices,sampleReceipt} from "./erpSampleScenario";

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
  entry("JV-S001",sampleInvoices[0].date,"1100","4020",sampleInvoices[0].faceMinor),
  entry("JV-S002",sampleReceipt.date,"1010","1100",sampleReceipt.amountMinor),
  entry("JV-S003",sampleInvoices[1].date,"1100","4020",sampleInvoices[1].faceMinor),
];

export const sampleCompany = {
  organizationId: org,
  currency: "PKR",
  asOfDate: "2026-11-21",
  sourceComplete: true,
  accounts: sampleChart,
  journals: sampleJournals,
} as const;
