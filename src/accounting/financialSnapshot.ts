import { assertValidChart } from "./chartOfAccounts";
import { addExact, parseMinorUnits, validBusinessDate } from "./minorUnits";
import type {
  AccountingSnapshotInput, ChartAccount, FinancialSnapshot, TrialBalanceRow,
} from "./types";

type Movement = { debit: bigint; credit: bigint };

const signed = (item: Movement): bigint => item.debit - item.credit;
const closingDebit = (item: Movement): bigint => signed(item) > 0n ? signed(item) : 0n;
const closingCredit = (item: Movement): bigint => signed(item) < 0n ? -signed(item) : 0n;

/**
 * Pure read model from a *complete, authorized, as-of* collection of posted journals.
 * The sourceComplete flag is a trust contract with the future server reader, NOT proof
 * of completeness supplied by the browser. This is NOT a cloud report endpoint.
 */
export function buildFinancialSnapshot(input: AccountingSnapshotInput): FinancialSnapshot {
  if (!validBusinessDate(input.asOfDate)) throw new Error("Invalid financial report cutoff date.");
  if (!input.sourceComplete) throw new Error("Incomplete financial source: statements are unavailable.");
  if (!input.currency.trim()) throw new Error("A base currency is required.");

  const accounts = assertValidChart(input.organizationId, input.accounts);
  const movements = new Map<string, Movement>();
  for (const account of input.accounts) {
    if (account.isPosting) movements.set(account.id, { debit: 0n, credit: 0n });
  }

  const journalIds = new Set<string>();
  const intentIds = new Set<string>();
  for (const journal of input.journals) {
    if (journal.organizationId !== input.organizationId || journal.currency !== input.currency) {
      throw new Error("Posted journal belongs to a different company or currency.");
    }
    if (journal.status !== "posted" || !validBusinessDate(journal.businessDate)) {
      throw new Error("Financial source includes an invalid or unposted journal.");
    }
    if (!journal.id.trim() || !journal.intentId.trim() ||
        journalIds.has(journal.id) || intentIds.has(journal.intentId)) {
      throw new Error("Financial source contains a duplicate or missing journal/intent ID.");
    }
    journalIds.add(journal.id);
    intentIds.add(journal.intentId);
    if (journal.lines.length < 2) throw new Error("Posted journal requires at least two lines.");

    let journalDr = 0n;
    let journalCr = 0n;
    const perJournal = new Map<string, Movement>();
    const lineIds = new Set<string>();

    for (const line of journal.lines) {
      const account: ChartAccount | undefined = accounts.get(line.accountId);
      if (!account || !account.isPosting) {
        throw new Error("Posted source references a missing, foreign or heading account.");
      }
      // Historic inactive accounts remain readable; disabling future posting cannot erase history.
      if (!line.lineId.trim() || lineIds.has(line.lineId)) {
        throw new Error("Posted journal has a duplicate or missing line ID.");
      }
      lineIds.add(line.lineId);
      const dr = parseMinorUnits(line.debitMinor);
      const cr = parseMinorUnits(line.creditMinor);
      if (dr < 0n || cr < 0n || (dr > 0n) === (cr > 0n)) {
        throw new Error("Posted line violates the debit/credit side invariant.");
      }
      journalDr = addExact(journalDr, dr);
      journalCr = addExact(journalCr, cr);
      const previous = perJournal.get(account.id) || { debit: 0n, credit: 0n };
      perJournal.set(account.id, {
        debit: addExact(previous.debit, dr),
        credit: addExact(previous.credit, cr),
      });
    }
    if (journalDr !== journalCr) throw new Error("Posted journal is not exactly balanced.");
    if (journal.businessDate > input.asOfDate) continue;
    for (const [accountId, delta] of perJournal) {
      const previous = movements.get(accountId);
      if (!previous) throw new Error("Posting account is absent from the complete chart.");
      movements.set(accountId, {
        debit: addExact(previous.debit, delta.debit),
        credit: addExact(previous.credit, delta.credit),
      });
    }
  }

  let totalDr = 0n;
  let totalCr = 0n;
  let closeDr = 0n;
  let closeCr = 0n;
  let assets = 0n;
  let liabilities = 0n;
  let equity = 0n;
  let revenue = 0n;
  let cos = 0n;
  let expenses = 0n;
  let otherIncome = 0n;
  let otherExpenses = 0n;
  const rows: TrialBalanceRow[] = [];

  for (const account of input.accounts) {
    if (!account.isPosting) continue;
    const item = movements.get(account.id);
    if (!item) throw new Error("An account is missing from the report snapshot.");
    totalDr = addExact(totalDr, item.debit);
    totalCr = addExact(totalCr, item.credit);
    closeDr = addExact(closeDr, closingDebit(item));
    closeCr = addExact(closeCr, closingCredit(item));
    rows.push({
      accountId: account.id,
      code: account.code,
      name: account.name,
      accountClass: account.accountClass,
      totalDebitMinor: item.debit.toString(),
      totalCreditMinor: item.credit.toString(),
      closingDebitMinor: closingDebit(item).toString(),
      closingCreditMinor: closingCredit(item).toString(),
    });
    const value = signed(item);
    switch (account.accountClass) {
      case "asset": assets += value; break;
      case "liability": liabilities -= value; break;
      case "equity": equity -= value; break;
      case "revenue": revenue -= value; break;
      case "cost_of_sales": cos += value; break;
      case "expense": expenses += value; break;
      case "other_income": otherIncome -= value; break;
      case "other_expense": otherExpenses += value; break;
    }
  }
  if (totalDr !== totalCr || closeDr !== closeCr) {
    throw new Error("Trial balance integrity failure.");
  }

  const earnings = revenue + otherIncome - cos - expenses - otherExpenses;
  const totalEquity = equity + earnings;
  const difference = assets - liabilities - totalEquity;
  if (difference !== 0n) throw new Error("Balance sheet integrity failure.");

  rows.sort((a, b) => a.code.localeCompare(b.code));
  return {
    organizationId: input.organizationId,
    currency: input.currency,
    asOfDate: input.asOfDate,
    trialBalance: {
      rows,
      totalDebitMinor: totalDr.toString(),
      totalCreditMinor: totalCr.toString(),
      closingDebitMinor: closeDr.toString(),
      closingCreditMinor: closeCr.toString(),
    },
    incomeStatement: {
      revenueMinor: revenue.toString(),
      costOfSalesMinor: cos.toString(),
      expensesMinor: expenses.toString(),
      otherIncomeMinor: otherIncome.toString(),
      otherExpensesMinor: otherExpenses.toString(),
      netEarningsMinor: earnings.toString(),
    },
    balanceSheet: {
      assetsMinor: assets.toString(),
      liabilitiesMinor: liabilities.toString(),
      recordedEquityMinor: equity.toString(),
      unclosedEarningsMinor: earnings.toString(),
      totalEquityMinor: totalEquity.toString(),
      differenceMinor: difference.toString(),
    },
  };
}
