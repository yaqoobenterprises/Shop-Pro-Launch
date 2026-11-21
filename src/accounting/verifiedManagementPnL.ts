import type { VerifiedTrialBalance } from "./verifiedTrialBalance";
import { nonNegativeReadMinor } from "./verifiedReadValidation";

export interface CertifiedManagementPnL {
  organizationId: string;
  currency: string;
  fromDate: string;
  toDate: string;
  revenueMinor: string;
  costOfSalesMinor: string;
  grossProfitMinor: string;
  expensesMinor: string;
  otherIncomeMinor: string;
  otherExpensesMinor: string;
  netEarningsMinor: string;
  sourceToken: string;
  scope: "V2_POSTED_ONLY_NOT_STATUTORY";
}

/**
 * Use only with the COMPLETE tenant-authorized verified TB collector. Its
 * period debit/credit movements avoid counting cumulative prior-year income.
 *
 * This does NOT assert statutory compliance, tax, group consolidation, IFRS 18
 * subtotals, bank verification or correctness of economic classifications.
 */
export function deriveCertifiedManagementPnL(report: VerifiedTrialBalance): CertifiedManagementPnL {
  const source = report?.source;
  if (!source || source.contract_version !== "aqvora-read-v1" ||
      source.basis !== "v2_posted_journals" || source.source_complete !== true ||
      source.legacy_included !== false || !source.organization_id ||
      !/^[A-Z]{3}$/.test(source.currency) || !source.snapshot_token ||
      !Array.isArray(report.rows) ||
      !/^(0|[1-9]\d*)$/.test(report.matchedCount) ||
      BigInt(report.matchedCount) !== BigInt(report.rows.length)) {
    throw new Error("A complete, company-scoped, certified V2 Trial Balance is required.");
  }
  const sourceDebit = nonNegativeReadMinor(report.totals.debit_minor, "TB source period debits");
  const sourceCredit = nonNegativeReadMinor(report.totals.credit_minor, "TB source period credits");
  if (sourceDebit !== sourceCredit) throw new Error("Source Trial Balance is not balanced.");

  let revenue = 0n;
  let costOfSales = 0n;
  let expenses = 0n;
  let otherIncome = 0n;
  let otherExpenses = 0n;
  let validatedDebit = 0n;
  let validatedCredit = 0n;
  const usedIds = new Set<string>();
  for (const row of report.rows) {
    const a = row.account;
    if (!a || a.organization_id !== source.organization_id || !a.id ||
        !a.is_posting || usedIds.has(a.id)) {
      throw new Error("Financial report contains foreign, duplicate or non-posting accounts.");
    }
    usedIds.add(a.id);
    const debit = nonNegativeReadMinor(row.debit_minor, "account period debit");
    const credit = nonNegativeReadMinor(row.credit_minor, "account period credit");
    validatedDebit += debit;
    validatedCredit += credit;
    const signed = debit - credit;
    switch (a.account_class) {
      case "revenue": revenue -= signed; break;
      case "cost_of_sales": costOfSales += signed; break;
      case "expense": expenses += signed; break;
      case "other_income": otherIncome -= signed; break;
      case "other_expense": otherExpenses += signed; break;
      case "asset":
      case "liability":
      case "equity": break;
      default: throw new Error("Unknown financial account classification.");
    }
  }
  if (validatedDebit !== sourceDebit || validatedCredit !== sourceCredit) {
    throw new Error("Source Trial Balance and full account movements do not match.");
  }
  const grossProfit = revenue - costOfSales;
  const net = grossProfit - expenses + otherIncome - otherExpenses;
  return {
    organizationId: source.organization_id,
    currency: source.currency,
    fromDate: source.from_date,
    toDate: source.to_date,
    revenueMinor: revenue.toString(),
    costOfSalesMinor: costOfSales.toString(),
    grossProfitMinor: grossProfit.toString(),
    expensesMinor: expenses.toString(),
    otherIncomeMinor: otherIncome.toString(),
    otherExpensesMinor: otherExpenses.toString(),
    netEarningsMinor: net.toString(),
    sourceToken: source.snapshot_token,
    scope: "V2_POSTED_ONLY_NOT_STATUTORY",
  };
}
