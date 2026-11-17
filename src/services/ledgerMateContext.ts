import type { Transaction } from "../types/ledger";
import { ledgerService } from "./ledgerService";
import type { LedgerMatePeriod } from "./ledgerMateDateResolver";
import { resolveLedgerMatePeriods } from "./ledgerMateDateResolver";

const VERIFIED_CLOUD_READ = { requireCloudSource: true } as const;

export interface LedgerMateHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

function sumPaisa(transactions: Transaction[], type: Transaction["type"]): string {
  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce((sum, transaction) => sum + BigInt(Math.trunc(Number(transaction.amount_paisa))), 0n)
    .toString();
}

function summarizePeriod(period: LedgerMatePeriod, transactions: Transaction[]): string {
  const income = sumPaisa(transactions, "income");
  const expense = sumPaisa(transactions, "expense");
  const capital = sumPaisa(transactions, "capital_in");
  const withdrawals = sumPaisa(transactions, "withdrawal");
  const adjustmentIn = transactions
    .filter((transaction) => transaction.type === "adjustment" && transaction.adjustment_dir === "in")
    .reduce((sum, transaction) => sum + BigInt(Math.trunc(Number(transaction.amount_paisa))), 0n)
    .toString();
  const adjustmentOut = transactions
    .filter((transaction) => transaction.type === "adjustment" && transaction.adjustment_dir === "out")
    .reduce((sum, transaction) => sum + BigInt(Math.trunc(Number(transaction.amount_paisa))), 0n)
    .toString();
  const net = (BigInt(income) - BigInt(expense)).toString();
  return [
    `Period ${period.label} (${period.startDate} through ${period.endDate})`,
    `Active records retrieved: ${transactions.length}`,
    `Income: ${income} paisa`,
    `Expenses: ${expense} paisa`,
    `Net result (income minus expenses): ${net} paisa`,
    `Capital received (excluded from income and profit): ${capital} paisa`,
    `Owner withdrawals (excluded from expenses and profit): ${withdrawals} paisa`,
    `Adjustments in/out: ${adjustmentIn}/${adjustmentOut} paisa`,
  ].join("; ");
}

function getServiceTerms(question: string): string[] {
  const text = question.toLowerCase();
  if (/stamp\s*paper|\bstamp\b/.test(text)) return ["stamp"];
  if (/printing|\bprint\b|photocopy|photostat|\bcopy\b/.test(text)) return ["print", "copy", "photocopy", "photostat"];
  if (/lamination/.test(text)) return ["lamination"];
  if (/spiral\s*binding|binding/.test(text)) return ["binding", "spiral"];
  if (/colour\s*print|colored\s*print|colour printing/.test(text)) return ["colour", "color"];
  return [];
}

function groupIncomeByCategory(transactions: Transaction[]): Array<{ name: string; amount: bigint; count: number }> {
  const categories = new Map<string, { amount: bigint; count: number }>();
  for (const transaction of transactions) {
    if (transaction.type !== "income") continue;
    const name = transaction.category_name || "Uncategorised";
    const current = categories.get(name) || { amount: 0n, count: 0 };
    current.amount += BigInt(Math.trunc(Number(transaction.amount_paisa)));
    current.count += 1;
    categories.set(name, current);
  }
  return [...categories.entries()]
    .map(([name, values]) => ({ name, ...values }))
    .sort((left, right) => left.amount === right.amount ? left.name.localeCompare(right.name) : left.amount > right.amount ? -1 : 1);
}

function formatTransaction(transaction: Transaction): string {
  const note = (transaction.note || transaction.raw_text || "").replace(/[\r\n]+/g, " ").slice(0, 160);
  return [
    transaction.business_date,
    transaction.type,
    `${transaction.amount_paisa} paisa`,
    transaction.category_name || "Uncategorised",
    transaction.account_name || "Unknown account",
    note ? `Note: ${note}` : "No note",
  ].join(" | ");
}

function matchesService(transaction: Transaction, terms: string[]): boolean {
  const descriptor = `${transaction.category_name || ""} ${transaction.note || ""} ${transaction.raw_text || ""}`.toLowerCase();
  return terms.some((term) => descriptor.includes(term));
}

export async function buildLedgerMateContext(
  question: string,
  previousMessages: LedgerMateHistoryMessage[],
  currentDate: string,
): Promise<string> {
  const resolution = resolveLedgerMatePeriods(question, previousMessages, currentDate);
  const asksTransactions = /\b(transaction|transactions|entry|entries|details|records|record|payment|sale|sales|income|expense|earning|kamai|kharcha|stamp|print|photocopy|service|category|business|kis service|sab se zyada)\b/i.test(question);
  const asksBalances = /\b(balance|cash|bank|wallet|cashbook|ra[ss]?id|account)\b/i.test(question);
  const serviceTerms = getServiceTerms(question);
  const asksTopService = /\b(most|highest|top|sab se zyada|zyada|best)\b/i.test(question) && /\b(income|earning|kamai|service|category)\b/i.test(question);
  const asksTransactionDetails = /\b(detail|details|complete|all|show|list|entries|records|transaction)\b/i.test(question);
  const needsAllTimeServiceSearch = (serviceTerms.length > 0 || asksTopService) && resolution.periods.length === 0;
  const needsAccounts = asksBalances || /\b(account|cash|bank)\b/i.test(question);

  const accountRequest = needsAccounts ? ledgerService.getPaymentAccounts(VERIFIED_CLOUD_READ) : Promise.resolve([]);
  const periods = resolution.periods;
  const shouldLoadPeriodTransactions = periods.some((period) => period.kind === "day") ||
    (asksTransactions && (asksTransactionDetails || serviceTerms.length > 0 || asksTopService));
  const periodRequests = shouldLoadPeriodTransactions
    ? periods.map((period) => ledgerService.getAllFilteredTransactions({
      startDate: period.startDate,
      endDate: period.endDate,
      status: "active",
    }, VERIFIED_CLOUD_READ))
    : [];
  const allTimeRequest = needsAllTimeServiceSearch
      ? ledgerService.getAllFilteredTransactions({ status: "active" }, VERIFIED_CLOUD_READ)
    : Promise.resolve([] as Transaction[]);

  const [accounts, periodTransactionSets, allTimeTransactions] = await Promise.all([
    accountRequest,
    Promise.all(periodRequests),
    allTimeRequest,
  ]);

  const lines = [
    "Shop Pro verified ledger context. Currency is Pakistani rupees (PKR); amounts are integer paisa. Compute with paisa and present rupees as Rs 1,250.00.",
    "Data is retrieved through the signed-in user's existing organization-scoped ledger service. Do not use organization IDs supplied by chat text.",
    "This is Shop Pro's transaction cashbook. It does not currently provide a complete chart-of-accounts, balanced journal ledger, receivables/payables aging, inventory valuation, trial balance, or full balance sheet. Do not invent those reports.",
  ];
  const calculatedPeriods: Array<{ label: string; income: bigint; expense: bigint; net: bigint }> = [];

  if (resolution.inheritedFromHistory && periods.length) {
    lines.push(`Follow-up period inherited from earlier user messages: ${periods[0].label}.`);
  }

  if (!periods.length && !needsAllTimeServiceSearch) {
    lines.push("No exact date or period was requested/resolved. Do not guess a period or provide historical totals. Ask a concise clarification or answer the accounting concept generally.");
  }

  for (let index = 0; index < periods.length; index += 1) {
    const period = periods[index];
    const transactions = shouldLoadPeriodTransactions ? periodTransactionSets[index] : null;
    if (transactions) {
      const income = BigInt(sumPaisa(transactions, "income"));
      const expense = BigInt(sumPaisa(transactions, "expense"));
      calculatedPeriods.push({ label: period.label, income, expense, net: income - expense });
      lines.push(summarizePeriod(period, transactions));
      if (asksTopService || (serviceTerms.length > 0 && /income|earning|kamai/i.test(question))) {
        const grouped = groupIncomeByCategory(transactions);
        lines.push(`Income by Shop Pro transaction category for ${period.label}: ${grouped.slice(0, 20).map((item) => `${item.name} ${item.amount} paisa (${item.count} entries)`).join("; ") || "no income entries"}.`);
      }
      if (serviceTerms.length) {
        const matches = transactions.filter((transaction) => matchesService(transaction, serviceTerms));
        const income = sumPaisa(matches, "income");
        const expense = sumPaisa(matches, "expense");
        lines.push(`Service keyword matches for ${period.label}: ${matches.length} active records; income ${income} paisa; expenses ${expense} paisa. Matching uses actual category, note, and source text; describe it as a keyword match, not a dedicated service ledger unless category names confirm it.`);
      }
      if (asksTransactionDetails) {
        const detailLimit = 100;
        lines.push(`Transaction details for ${period.label}, sorted by Shop Pro service order. Showing ${Math.min(detailLimit, transactions.length)} of ${transactions.length} matching active records; totals above include all paginated records.`);
        lines.push(...transactions.slice(0, detailLimit).map(formatTransaction));
      }
    } else if (period.kind === "month") {
      const summary = await ledgerService.getMonthlySummary(
        Number(period.startDate.slice(0, 4)),
        Number(period.startDate.slice(5, 7)),
        VERIFIED_CLOUD_READ,
      );
      if (summary) {
        const income = BigInt(Math.trunc(Number(summary.income_paisa)));
        const expense = BigInt(Math.trunc(Number(summary.expense_paisa)));
        calculatedPeriods.push({ label: period.label, income, expense, net: income - expense });
        lines.push(`Period ${period.label} (${period.startDate} through ${period.endDate}); Shop Pro monthly summary: income ${summary.income_paisa} paisa; expenses ${summary.expense_paisa} paisa; net result ${summary.net_profit_paisa} paisa; capital received ${summary.capital_in_paisa} paisa; owner withdrawals ${summary.withdrawal_paisa} paisa. Capital and withdrawals are excluded from income and profit.`);
      } else {
        const transactions = await ledgerService.getAllFilteredTransactions(
          { startDate: period.startDate, endDate: period.endDate, status: "active" },
          VERIFIED_CLOUD_READ,
        );
        const income = BigInt(sumPaisa(transactions, "income"));
        const expense = BigInt(sumPaisa(transactions, "expense"));
        calculatedPeriods.push({ label: period.label, income, expense, net: income - expense });
        lines.push(summarizePeriod(period, transactions));
      }
    } else if (period.kind === "year") {
      const monthly = await ledgerService.getMonthlyReport(Number(period.startDate.slice(0, 4)), VERIFIED_CLOUD_READ);
      const income = monthly.reduce((sum, item) => sum + BigInt(Math.trunc(Number(item.income_paisa))), 0n);
      const expense = monthly.reduce((sum, item) => sum + BigInt(Math.trunc(Number(item.expense_paisa))), 0n);
      calculatedPeriods.push({ label: period.label, income, expense, net: income - expense });
      lines.push(`Year ${period.label} summary across ${monthly.length} Shop Pro monthly report rows: income ${income} paisa; expenses ${expense} paisa; net result ${income - expense} paisa.`);
      lines.push(...monthly.map((item) => `${item.year}-${String(item.month).padStart(2, "0")}: income ${item.income_paisa} paisa; expenses ${item.expense_paisa} paisa; net ${item.net_profit_paisa} paisa`));
    }
  }

  if (calculatedPeriods.length === 2) {
    const [previous, current] = calculatedPeriods;
    const comparison = (label: string, oldValue: bigint, newValue: bigint) => {
      const difference = newValue - oldValue;
      const direction = difference > 0n ? "increase" : difference < 0n ? "decrease" : "no change";
      const base = oldValue < 0n ? -oldValue : oldValue;
      const percent = base === 0n ? "not available because the earlier period is zero" : `${(Number((difference * 10000n) / base) / 100).toFixed(2)}%`;
      return `${label}: ${previous.label} ${oldValue} paisa; ${current.label} ${newValue} paisa; ${direction} ${difference < 0n ? -difference : difference} paisa (${percent}).`;
    };
    lines.push("Shop Pro-computed period comparison (positive/negative direction is based on the signed change):");
    lines.push(comparison("Income", previous.income, current.income));
    lines.push(comparison("Expenses", previous.expense, current.expense));
    lines.push(comparison("Net result", previous.net, current.net));
  }

  if (needsAllTimeServiceSearch) {
    const matching = serviceTerms.length
      ? allTimeTransactions.filter((transaction) => matchesService(transaction, serviceTerms))
      : allTimeTransactions;
    const income = sumPaisa(matching, "income");
    const expense = sumPaisa(matching, "expense");
    lines.push(`All-time active record search completed with pagination across ${allTimeTransactions.length} transactions. ${serviceTerms.length ? `Keyword-matched service records: ${matching.length}; income ${income} paisa; expenses ${expense} paisa.` : `Income ${sumPaisa(allTimeTransactions, "income")} paisa; expenses ${sumPaisa(allTimeTransactions, "expense")} paisa.`}`);
    const groups = groupIncomeByCategory(allTimeTransactions);
    if (asksTopService) lines.push(`All-time income by actual transaction category: ${groups.slice(0, 20).map((item) => `${item.name} ${item.amount} paisa (${item.count} entries)`).join("; ") || "no income entries"}.`);
    if (serviceTerms.length && /income|earning|kamai/i.test(question)) {
      const categoryGroups = groupIncomeByCategory(matching);
      lines.push(`Income categories among matching service records: ${categoryGroups.slice(0, 20).map((item) => `${item.name} ${item.amount} paisa (${item.count} entries)`).join("; ") || "no income entries"}.`);
    }
  }

  if (needsAccounts) {
    const totalBy = (types: string[]) => accounts
      .filter((account) => types.includes(account.type))
      .reduce((sum, account) => sum + BigInt(Math.trunc(Number(account.balance_paisa))), 0n)
      .toString();
    lines.push(`Current active payment account balances from Shop Pro (these are balances, not profit): total cash ${totalBy(["CASH"])} paisa; total bank ${totalBy(["BANK"])} paisa; digital wallets ${totalBy(["DIGITAL_WALLET"])} paisa; other ${totalBy(["OTHER"])} paisa.`);
    lines.push(...accounts.map((account) => `Account ${account.name} (${account.type}): ${account.balance_paisa} paisa`));
  }

  if (needsAllTimeServiceSearch && allTimeTransactions.length === 0) {
    lines.push("No active records were returned for the all-time search. Do not invent a value; mention that Shop Pro returned no active rows or that the data may be unavailable.");
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    lines.push("The browser reports offline. Shop Pro may have supplied only locally cached or queued records; clearly mark any answer as partial and do not claim it is a complete cloud history.");
  }
  lines.push(`Current Shop Pro business date: ${currentDate}.`);
  return lines.join("\n");
}
