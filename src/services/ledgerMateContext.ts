import type { AuditLogEntry, LedgerAccount, Transaction } from "../types/ledger";
import { ledgerService } from "./ledgerService";
import { resolveLedgerMatePeriods } from "./ledgerMateDateResolver";
import { detectLedgerMateLanguage, ledgerMateCopy } from "./ledgerMateLanguage";
import {
  asksTransactionCount,
  categoryNameFor,
  createCategoryReport,
  createDirectAnswer,
  createSummaryReport,
  createTransactionReport,
  createVoidReport,
  eventSnapshot,
  financialMetric,
  formatVoidTimestamp,
  groupIncomeByCategory,
  isComparison,
  periodLabel,
  TRANSACTION_DETAIL_LIMIT,
  VOID_DETAIL_LIMIT,
  type PeriodMetrics,
} from "./ledgerMateReport";

const VERIFIED_CLOUD_READ = { requireCloudSource: true } as const;

export interface LedgerMateHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LedgerMateAnalysis {
  context: string;
  directAnswer?: string;
  reportMarkdown?: string;
}

function sumPaisa(transactions: Transaction[], type: Transaction["type"]): bigint {
  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce((sum, transaction) => sum + BigInt(Math.trunc(Number(transaction.amount_paisa))), 0n);
}

function sumAdjustment(transactions: Transaction[], direction: "in" | "out"): bigint {
  return transactions
    .filter((transaction) => transaction.type === "adjustment" && transaction.adjustment_dir === direction)
    .reduce((sum, transaction) => sum + BigInt(Math.trunc(Number(transaction.amount_paisa))), 0n);
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

function matchesService(transaction: Transaction, terms: string[]): boolean {
  const descriptor = `${transaction.category_name || ""} ${transaction.note || ""} ${transaction.raw_text || ""}`.toLowerCase();
  return terms.some((term) => descriptor.includes(term));
}

function isVoidQuestion(question: string): boolean {
  return /\bvoid(?:ed|ing|e|s)?\b|\bcancel(?:led|ed|s)?\b|\bradd\b|Ù…Ù†Ø³ÙˆØ®|ÙˆØ§Ø¦Úˆ/i.test(question);
}

function isAllTimeQuestion(question: string): boolean {
  return /\b(all[ -]?time|ever|overall|since the beginning|ab tak|abhi tak|kabhi|kul mila kar)\b/i.test(question);
}

function usesOriginalBusinessDate(question: string): boolean {
  return /\b(original|business|transaction|entry) date\b|\bdated\b|\bki date\b/i.test(question);
}

function shiftDate(date: string, offset: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

export async function buildLedgerMateAnalysis(
  question: string,
  previousMessages: LedgerMateHistoryMessage[],
  currentDate: string,
): Promise<LedgerMateAnalysis> {
  const resolution = resolveLedgerMatePeriods(question, previousMessages, currentDate);
  const language = detectLedgerMateLanguage(question);
  const asksVoidActivity = isVoidQuestion(question);
  const asksAllTimeVoids = asksVoidActivity && isAllTimeQuestion(question);
  const asksOriginalBusinessDate = asksVoidActivity && usesOriginalBusinessDate(question);
  const asksTransactions = /\b(transaction|transactions|entry|entries|details|records|record|payment|sale|sales|income|expense|earning|kamai|kharcha|stamp|print|photocopy|service|category|business|kis service|sab se zyada)\b/i.test(question);
  const asksBalances = /\b(balance|cash|bank|wallet|cashbook|ra[ss]?id|account)\b/i.test(question);
  const serviceTerms = getServiceTerms(question);
  const asksTopService = /\b(most|highest|top|sab se zyada|zyada|best)\b/i.test(question) && /\b(income|earning|kamai|service|category)\b/i.test(question);
  const asksTransactionDetails = /\b(detail|details|complete|all|show|list|entries|records|transaction)\b/i.test(question);
  const asksCount = asksTransactionCount(question);
  const needsAllTimeServiceSearch = (serviceTerms.length > 0 || asksTopService) && resolution.periods.length === 0;
  const needsAccounts = asksBalances || /\b(account|cash|bank)\b/i.test(question);
  const shouldLoadPeriodTransactions = !asksVoidActivity && (
    resolution.periods.some((period) => period.kind === "day") ||
    (asksTransactions && (asksTransactionDetails || serviceTerms.length > 0 || asksTopService || asksCount))
  );
  const periods = resolution.periods;

  const accountRequest = needsAccounts
    ? ledgerService.getPaymentAccounts(VERIFIED_CLOUD_READ)
    : Promise.resolve([] as LedgerAccount[]);
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

  const voidRequests = asksVoidActivity && (periods.length > 0 || asksAllTimeVoids)
    ? (periods.length ? periods : [undefined]).map((period) => {
      if (asksOriginalBusinessDate && period) {
        return ledgerService.getFilteredTransactions({
          startDate: period.startDate,
          endDate: period.endDate,
          status: "voided",
          limit: VOID_DETAIL_LIMIT,
        }, VERIFIED_CLOUD_READ).then((result) => ({
          period,
          source: "current-status" as const,
          count: result.count,
          events: [] as AuditLogEntry[],
          transactions: result.transactions,
        }));
      }
      return ledgerService.getVoidAuditEvents({
        startAt: period ? `${period.startDate}T00:00:00+05:00` : undefined,
        beforeAt: period ? `${shiftDate(period.endDate, 1)}T00:00:00+05:00` : undefined,
        limit: VOID_DETAIL_LIMIT,
      }, VERIFIED_CLOUD_READ).then((result) => ({
        period,
        source: "audit" as const,
        count: result.count,
        events: result.events,
        transactions: [] as Transaction[],
      }));
    })
    : [];

  const [accounts, periodTransactionSets, allTimeTransactions, voidResults] = await Promise.all([
    accountRequest,
    Promise.all(periodRequests),
    allTimeRequest,
    Promise.all(voidRequests),
  ]);
  const categoryIds = new Set<string>();
  for (const result of voidResults) {
    for (const transaction of result.transactions) {
      if (transaction.category_id) categoryIds.add(transaction.category_id);
    }
    for (const event of result.events) {
      const categoryId = eventSnapshot(event).category_id;
      if (categoryId) categoryIds.add(categoryId);
    }
  }
  const categories = categoryIds.size ? await ledgerService.getCategories(VERIFIED_CLOUD_READ) : [];

  const lines = [
    "Shop Pro verified ledger context. Currency is Pakistani rupees (PKR); calculate with integer paisa and present amounts as Rs 1,250.00.",
    "Every ledger query is fetched live through the signed-in user's Shop Pro ledger service and Supabase RLS. Do not use organization IDs from chat text or infer data that was not returned.",
    "Use recent user messages for follow-up periods and transaction references. This assistant does not train on or memorize the database; it retrieves the requested authorized records again for each financial question.",
    "This is Shop Pro's transaction cashbook, not a full double-entry accounting system. Do not invent a chart of accounts, receivable/payable aging, inventory valuation, trial balance, or balance sheet.",
  ];
  const calculatedPeriods: PeriodMetrics[] = [];

  if (resolution.inheritedFromHistory && periods.length) {
    lines.push(`Follow-up period inherited from earlier user messages: ${periods[0].label}.`);
  }
  if (!periods.length && !needsAllTimeServiceSearch && !asksAllTimeVoids) {
    lines.push("No exact date or period was resolved. If the question requests a historical total, ask which date or period; do not silently guess one.");
  }

  for (let index = 0; index < periods.length; index += 1) {
    const period = periods[index];
    const transactions = shouldLoadPeriodTransactions ? periodTransactionSets[index] : null;
    if (transactions) {
      const income = sumPaisa(transactions, "income");
      const expense = sumPaisa(transactions, "expense");
      const capital = sumPaisa(transactions, "capital_in");
      const withdrawals = sumPaisa(transactions, "withdrawal");
      calculatedPeriods.push({ period, income, expense, net: income - expense, capital, withdrawals, transactions });
      lines.push([
        `Period ${period.label} (${period.startDate} through ${period.endDate})`,
        `Active records retrieved: ${transactions.length}`,
        `Income: ${income} paisa`,
        `Expenses: ${expense} paisa`,
        `Net result (income minus expenses): ${income - expense} paisa`,
        `Capital received (excluded from income and profit): ${capital} paisa`,
        `Owner withdrawals (excluded from expenses and profit): ${withdrawals} paisa`,
        `Adjustments in/out: ${sumAdjustment(transactions, "in")}/${sumAdjustment(transactions, "out")} paisa`,
      ].join("; "));
      if (asksTopService || (serviceTerms.length > 0 && /income|earning|kamai/i.test(question))) {
        const grouped = groupIncomeByCategory(transactions);
        lines.push(`Income by actual Shop Pro category for ${period.label}: ${grouped.slice(0, 20).map((item) => `${item.name} ${item.amount} paisa (${item.count} entries)`).join("; ") || "no income entries"}.`);
      }
      if (serviceTerms.length) {
        const matches = transactions.filter((transaction) => matchesService(transaction, serviceTerms));
        lines.push(`Service keyword matches for ${period.label}: ${matches.length} active records; income ${sumPaisa(matches, "income")} paisa; expenses ${sumPaisa(matches, "expense")} paisa. These are matches against actual category, note, and source text, not a separately maintained service ledger.`);
      }
      if (asksTransactionDetails) {
        lines.push(`Transaction details for ${period.label}. Showing up to ${TRANSACTION_DETAIL_LIMIT} rows; period totals include every paginated matching record.`);
        lines.push(...transactions.slice(0, TRANSACTION_DETAIL_LIMIT).map((transaction) =>
          [transaction.business_date, transaction.type, `${transaction.amount_paisa} paisa`, transaction.category_name || "Uncategorised", transaction.account_name || "Unknown account", transaction.note || transaction.raw_text || "No note"].join(" | "),
        ));
      }
      continue;
    }

    if (asksVoidActivity) continue;
    if (period.kind === "month") {
      const summary = await ledgerService.getMonthlySummary(
        Number(period.startDate.slice(0, 4)),
        Number(period.startDate.slice(5, 7)),
        VERIFIED_CLOUD_READ,
      );
      if (summary) {
        const income = BigInt(Math.trunc(Number(summary.income_paisa)));
        const expense = BigInt(Math.trunc(Number(summary.expense_paisa)));
        const capital = BigInt(Math.trunc(Number(summary.capital_in_paisa)));
        const withdrawals = BigInt(Math.trunc(Number(summary.withdrawal_paisa)));
        calculatedPeriods.push({ period, income, expense, net: income - expense, capital, withdrawals });
        lines.push(`Period ${period.label} (${period.startDate} through ${period.endDate}); Shop Pro monthly summary: income ${summary.income_paisa} paisa; expenses ${summary.expense_paisa} paisa; net result ${summary.net_profit_paisa} paisa; capital received ${summary.capital_in_paisa} paisa; owner withdrawals ${summary.withdrawal_paisa} paisa. Capital and withdrawals are excluded from income and expenses.`);
      } else {
        const rows = await ledgerService.getAllFilteredTransactions(
          { startDate: period.startDate, endDate: period.endDate, status: "active" },
          VERIFIED_CLOUD_READ,
        );
        const income = sumPaisa(rows, "income");
        const expense = sumPaisa(rows, "expense");
        const capital = sumPaisa(rows, "capital_in");
        const withdrawals = sumPaisa(rows, "withdrawal");
        calculatedPeriods.push({ period, income, expense, net: income - expense, capital, withdrawals, transactions: rows });
        lines.push(`Period ${period.label} (${period.startDate} through ${period.endDate}); ${rows.length} active records: income ${income} paisa; expenses ${expense} paisa; net result ${income - expense} paisa.`);
      }
    } else if (period.kind === "year") {
      const monthly = await ledgerService.getMonthlyReport(Number(period.startDate.slice(0, 4)), VERIFIED_CLOUD_READ);
      const income = monthly.reduce((sum, item) => sum + BigInt(Math.trunc(Number(item.income_paisa))), 0n);
      const expense = monthly.reduce((sum, item) => sum + BigInt(Math.trunc(Number(item.expense_paisa))), 0n);
      const capital = monthly.reduce((sum, item) => sum + BigInt(Math.trunc(Number(item.capital_in_paisa))), 0n);
      const withdrawals = monthly.reduce((sum, item) => sum + BigInt(Math.trunc(Number(item.withdrawal_paisa))), 0n);
      calculatedPeriods.push({ period, income, expense, net: income - expense, capital, withdrawals });
      lines.push(`Year ${period.label}: ${monthly.length} Shop Pro monthly rows; income ${income} paisa; expenses ${expense} paisa; net result ${income - expense} paisa.`);
      lines.push(...monthly.map((item) => `${item.year}-${String(item.month).padStart(2, "0")}: income ${item.income_paisa} paisa; expenses ${item.expense_paisa} paisa; net ${item.net_profit_paisa} paisa`));
    }
  }

  for (const result of voidResults) {
    const label = result.period ? result.period.label : "all time";
    const basis = result.source === "audit"
      ? "immutable audit_log action=void rows filtered by audit created_at in PKT; restored transactions stay included"
      : "currently voided transactions filtered by original business_date";
    lines.push(`Void activity for ${label}: exactly ${result.count} matching records. Query basis: ${basis}. Returned ${result.events.length || result.transactions.length} detail rows, capped at ${VOID_DETAIL_LIMIT}; do not report the returned sample size as the total count.`);
    const items = result.source === "audit"
      ? result.events.map((event) => ({ event, transaction: eventSnapshot(event) }))
      : result.transactions.map((transaction) => ({ event: null, transaction }));
    lines.push(...items.map(({ event, transaction }) => [
      event ? formatVoidTimestamp(event.created_at) : transaction.voided_at || "Unknown void time",
      transaction.business_date || "Unknown business date",
      transaction.type || "Unknown type",
      categoryNameFor(transaction.category_id, categories),
      typeof transaction.amount_paisa === "number" ? `${transaction.amount_paisa} paisa` : "Unknown amount",
      transaction.void_reason || "No reason recorded",
      event ? `Changed by ${event.changed_by_name}` : "",
    ].filter(Boolean).join(" | ")));
  }

  if (calculatedPeriods.length === 2) {
    const [previous, current] = calculatedPeriods;
    const comparison = (label: string, oldValue: bigint, newValue: bigint) => {
      const difference = newValue - oldValue;
      const direction = difference > 0n ? "increase" : difference < 0n ? "decrease" : "no change";
      const base = oldValue < 0n ? -oldValue : oldValue;
      const percent = base === 0n
        ? "not available because the earlier period is zero"
        : `${(Number((difference * 10000n) / base) / 100).toFixed(2)}%`;
      return `${label}: ${previous.period.label} ${oldValue} paisa; ${current.period.label} ${newValue} paisa; ${direction} ${difference < 0n ? -difference : difference} paisa (${percent}).`;
    };
    lines.push("Shop Pro-computed comparison (the percentage uses the earlier period as the baseline):");
    lines.push(comparison("Income", previous.income, current.income));
    lines.push(comparison("Expenses", previous.expense, current.expense));
    lines.push(comparison("Net result", previous.net, current.net));
  }

  let searchedGroups: Array<{ name: string; amount: bigint; count: number }> = [];
  if (needsAllTimeServiceSearch) {
    const matching = serviceTerms.length
      ? allTimeTransactions.filter((transaction) => matchesService(transaction, serviceTerms))
      : allTimeTransactions;
    const groups = groupIncomeByCategory(allTimeTransactions);
    searchedGroups = serviceTerms.length ? groupIncomeByCategory(matching) : groups;
    lines.push(`All-time active record search completed with pagination across ${allTimeTransactions.length} transactions. ${serviceTerms.length ? `Keyword-matched service records: ${matching.length}; income ${sumPaisa(matching, "income")} paisa; expenses ${sumPaisa(matching, "expense")} paisa.` : `Income ${sumPaisa(allTimeTransactions, "income")} paisa; expenses ${sumPaisa(allTimeTransactions, "expense")} paisa.`}`);
    if (asksTopService) lines.push(`All-time income by actual Shop Pro transaction category: ${groups.slice(0, 20).map((item) => `${item.name} ${item.amount} paisa (${item.count} entries)`).join("; ") || "no income entries"}.`);
    if (serviceTerms.length && /income|earning|kamai|sale|sales/i.test(question)) {
      lines.push(`Income categories among matched service records: ${searchedGroups.slice(0, 20).map((item) => `${item.name} ${item.amount} paisa (${item.count} entries)`).join("; ") || "no income entries"}.`);
    }
  }

  if (needsAccounts) {
    const totalBy = (types: string[]) => accounts
      .filter((account) => types.includes(account.type))
      .reduce((sum, account) => sum + BigInt(Math.trunc(Number(account.balance_paisa))), 0n);
    lines.push(`Current active payment account balances from Shop Pro (these are balances, not profit): cash ${totalBy(["CASH"])} paisa; bank ${totalBy(["BANK"])} paisa; digital wallets ${totalBy(["DIGITAL_WALLET"])} paisa; other ${totalBy(["OTHER"])} paisa.`);
    lines.push(...accounts.map((account) => `Account ${account.name} (${account.type}): ${account.balance_paisa} paisa`));
  }

  if (asksVoidActivity && !voidResults.length) {
    lines.push("Void activity requires a date or period. Inherit the most recent date from chat when present; otherwise ask which date or period. Never claim there were no voids without a successful audit query.");
  }
  if (needsAllTimeServiceSearch && allTimeTransactions.length === 0) {
    lines.push("The all-time service query returned no active rows. Do not invent a value; explain that no matching active records were returned.");
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    lines.push("The browser reports offline. Do not claim an authoritative cloud query completed.");
  }
  lines.push(`Current Shop Pro business date: ${currentDate}. Latest user message language: ${language}.`);

  const copy = (key: Parameters<typeof ledgerMateCopy>[1]) => ledgerMateCopy(language, key);
  const serviceTransactions = serviceTerms.length && needsAllTimeServiceSearch
    ? allTimeTransactions.filter((transaction) => matchesService(transaction, serviceTerms))
    : serviceTerms.length && calculatedPeriods.length === 1 && calculatedPeriods[0].transactions
      ? calculatedPeriods[0].transactions.filter((transaction) => matchesService(transaction, serviceTerms))
      : undefined;
  const serviceMetrics = serviceTransactions
    ? {
      income: sumPaisa(serviceTransactions, "income"),
      expense: sumPaisa(serviceTransactions, "expense"),
      transactionCount: serviceTransactions.length,
    }
    : undefined;
  const topGroups = needsAllTimeServiceSearch
    ? searchedGroups
    : calculatedPeriods.length === 1 && calculatedPeriods[0].transactions
      ? groupIncomeByCategory(serviceTerms.length
        ? calculatedPeriods[0].transactions.filter((transaction) => matchesService(transaction, serviceTerms))
        : calculatedPeriods[0].transactions)
      : [];
  const reportParts = [
    voidResults.length ? createVoidReport(voidResults, language, categories) : "",
    !voidResults.length && (financialMetric(question) || isComparison(question))
      ? createSummaryReport(calculatedPeriods, language)
      : "",
    asksTopService || (serviceTerms.length > 0 && /income|earning|kamai|sale|sales/i.test(question))
      ? createCategoryReport(topGroups, language, periods[0] ? periodLabel(periods[0]) : copy("allTime"))
      : "",
    !voidResults.length && asksTransactionDetails && calculatedPeriods[0]?.transactions
      ? createTransactionReport(calculatedPeriods[0].period, calculatedPeriods[0].transactions, language)
      : "",
  ].filter(Boolean);
  const reportMarkdown = [...new Set(reportParts)].join("\n\n");
  const directAnswer = createDirectAnswer(question, language, calculatedPeriods, voidResults, topGroups, serviceMetrics);

  return {
    context: lines.join("\n"),
    ...(directAnswer ? { directAnswer } : {}),
    ...(reportMarkdown ? { reportMarkdown } : {}),
  };
}

export async function buildLedgerMateContext(
  question: string,
  previousMessages: LedgerMateHistoryMessage[],
  currentDate: string,
): Promise<string> {
  return (await buildLedgerMateAnalysis(question, previousMessages, currentDate)).context;
}
