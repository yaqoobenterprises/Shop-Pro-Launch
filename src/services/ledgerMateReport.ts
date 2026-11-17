import type { AuditLogEntry, Transaction } from "../types/ledger";

import type { LedgerMatePeriod } from "./ledgerMateDateResolver";

import { ledgerMateCopy, type LedgerMateLanguage } from "./ledgerMateLanguage";

export const VOID_DETAIL_LIMIT = 8;

export const TRANSACTION_DETAIL_LIMIT = 60;

export type FinancialMetric = "income" | "expense" | "net" | "transaction-count";

export interface PeriodMetrics {
  period: LedgerMatePeriod;
  income: bigint;
  expense: bigint;
  net: bigint;
  capital: bigint;
  withdrawals: bigint;
  transactions?: Transaction[];
}

export interface VoidPeriodResult {
  period?: LedgerMatePeriod;
  source: "audit" | "current-status";
  count: number;
  events: AuditLogEntry[];
  transactions: Transaction[];
}

function formatPaisa(paisa: bigint): string {
  const negative = paisa < 0n;
  const absolute = negative ? -paisa : paisa;
  const rupees = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = String(absolute % 100n).padStart(2, "0");
  return `${negative ? "-" : ""}Rs ${rupees}.${cents}`;
}

function allTimeLabel(language: LedgerMateLanguage): string {
  if (language === "roman-urdu") return "ab tak";
  if (language === "urdu") return "Ø§Ø¨ ØªÚ©";
  return "all time";
}

function safeCell(value: unknown): string {
  return String(value ?? "â€”").replace(/[|\r\n]+/g, " / ").trim() || "â€”";
}

function markdownTable(headers: string[], rows: string[][]): string {
  if (!rows.length) return "";
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${headers.map((_, index) => safeCell(row[index])).join(" | ")} |`),
  ].join("\n");
}

export function groupIncomeByCategory(transactions: Transaction[]): Array<{ name: string; amount: bigint; count: number }> {
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

export function isComparison(question: string): boolean {
  return /\b(compare|comparison|compared|versus|vs\.?|increase|increased|decrease|difference|muqabla|farq|kitn[ai] barh|barh[ai])\b/i.test(question);
}

export function asksTransactionCount(question: string): boolean {
  return /\b(how many|count|number of|kitn[aei]|kul kitn[aei])\b/i.test(question) &&
    /\b(transaction|transactions|entry|entries|record|records)\b/i.test(question);
}

export function financialMetric(question: string): FinancialMetric | null {
  const text = question.toLowerCase();
  if (asksTransactionCount(text)) return "transaction-count";
  if (/\b(expense|expenses|kharcha|kharchay|kharch|costs?)\b/.test(text)) return "expense";
  if (/\b(profit|net result|net income|munafa|faida)\b/.test(text)) return "net";
  if (/\b(sale|sales|income|earning|kamai|revenue)\b/.test(text)) return "income";
  return null;
}

export function periodLabel(period: LedgerMatePeriod): string {
  if (period.kind === "year") return period.label;
  if (period.kind === "month") {
    const date = new Date(`${period.startDate}T12:00:00Z`);
    return new Intl.DateTimeFormat("en-PK", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  }
  const date = new Date(`${period.startDate}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-PK", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

export function categoryNameFor(
  categoryId: string | null | undefined,
  categories: Array<{ id: string; name: string }>,
): string {
  return categories.find((category) => category.id === categoryId)?.name || "Uncategorised";
}

export function eventSnapshot(event: AuditLogEntry): Partial<Transaction> {
  return event.new_data || event.old_data || {};
}

export function formatVoidTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Karachi",
  }).format(date);
}

export function createVoidReport(
  results: VoidPeriodResult[],
  language: LedgerMateLanguage,
  categories: Array<{ id: string; name: string }>,
): string {
  const copy = (key: Parameters<typeof ledgerMateCopy>[1]) => ledgerMateCopy(language, key);
  const parts: string[] = [];
  for (const result of results) {
    const label = result.period ? periodLabel(result.period) : copy("allTime");
    parts.push(`### ${copy("verifiedVoidActivity")} â€” ${label}`);
    parts.push(markdownTable([copy("metric"), copy("amount")], [[copy("voidedTransactions"), String(result.count)]]));
    if (result.source === "audit") {
      parts.push(language === "english"
        ? "Count uses Shop Pro's immutable void audit events, dated by the time the void was recorded in Pakistan Standard Time. Restored records remain visible in this history."
        : language === "roman-urdu"
          ? "Count Shop Pro ki immutable void audit history se hai; waqt Pakistan Standard Time ke mutabiq hai. Baad mein restore hui entry bhi history mein rehti hai."
          : "Ú¯Ù†ØªÛŒ Shop Pro Ú©ÛŒ Ù…Ø­ÙÙˆØ¸ void audit history Ø³Û’ ÛÛ’Ø› ÙˆÙ‚Øª Ù¾Ø§Ú©Ø³ØªØ§Ù† Ø§Ø³Ù¹ÛŒÙ†ÚˆØ±Úˆ Ù¹Ø§Ø¦Ù… Ú©Û’ Ù…Ø·Ø§Ø¨Ù‚ ÛÛ’Û” Ø¨Ø¹Ø¯ Ù…ÛŒÚº restore ÛÙˆÙ†Û’ ÙˆØ§Ù„ÛŒ Ø§Ù†Ù¹Ø±ÛŒ Ø¨Ú¾ÛŒ ØªØ§Ø±ÛŒØ® Ù…ÛŒÚº Ø´Ø§Ù…Ù„ Ø±ÛØªÛŒ ÛÛ’Û”");
    } else {
      parts.push(language === "english"
        ? "This list shows transactions whose current status is voided, filtered by their original business date."
        : language === "roman-urdu"
          ? "Yeh list un transactions ki hai jinka current status voided hai, aur filter unki asal business date par laga hai."
          : "ÛŒÛ ÙÛØ±Ø³Øª Ø§Ù† Ù¹Ø±Ø§Ù†Ø²ÛŒÚ©Ø´Ù†Ø² Ú©ÛŒ ÛÛ’ Ø¬Ù† Ú©Ø§ Ù…ÙˆØ¬ÙˆØ¯Û status voided ÛÛ’Ø› ÙÙ„Ù¹Ø± Ø§Ù† Ú©ÛŒ Ø§ØµÙ„ Ú©Ø§Ø±ÙˆØ¨Ø§Ø±ÛŒ ØªØ§Ø±ÛŒØ® Ù¾Ø± ÛÛ’Û”");
    }
    const items = result.source === "audit"
      ? result.events.map((event) => ({ event, transaction: eventSnapshot(event) }))
      : result.transactions.map((transaction) => ({ event: null, transaction }));
    if (items.length) {
      parts.push(`${copy("showing")} ${Math.min(items.length, VOID_DETAIL_LIMIT)} ${copy("of")} ${result.count} ${copy("latest")} ${copy("entries")}.`);
      const rows = items.slice(0, VOID_DETAIL_LIMIT).map(({ event, transaction }) => [
        event ? formatVoidTimestamp(event.created_at) : formatVoidTimestamp(transaction.voided_at || ""),
        transaction.business_date || "â€”",
        transaction.type || "â€”",
        categoryNameFor(transaction.category_id, categories),
        typeof transaction.amount_paisa === "number" ? formatPaisa(BigInt(transaction.amount_paisa)) : "â€”",
        transaction.void_reason || "â€”",
      ]);
      parts.push(markdownTable([
        copy("timeOfVoid"), copy("businessDate"), copy("type"), copy("category"), copy("amount"), copy("reason"),
      ], rows));
    } else if (result.count === 0) {
      parts.push(copy("noVoids"));
    } else {
      parts.push(language === "english"
        ? "Shop Pro counted matching void records, but did not return detail rows for this response."
        : language === "roman-urdu"
          ? "Shop Pro ne matching void records gine hain, lekin is jawab mein unki detail rows nahi milin."
          : "Shop Pro Ù†Û’ Ù…ØªØ¹Ù„Ù‚Û void Ø±ÛŒÚ©Ø§Ø±Úˆ Ú¯Ù†Û’ ÛÛŒÚºØŒ Ù…Ú¯Ø± Ø§Ø³ Ø¬ÙˆØ§Ø¨ Ù…ÛŒÚº Ø§Ù† Ú©ÛŒ ØªÙØµÛŒÙ„ ÙˆØ§Ù¾Ø³ Ù†ÛÛŒÚº Ø¢Ø¦ÛŒÛ”");
    }
  }
  return parts.filter(Boolean).join("\n\n");
}

export function createSummaryReport(metrics: PeriodMetrics[], language: LedgerMateLanguage): string {
  const copy = (key: Parameters<typeof ledgerMateCopy>[1]) => ledgerMateCopy(language, key);
  if (metrics.length === 2) {
    const rows = metrics.map((item) => [
      periodLabel(item.period),
      formatPaisa(item.income),
      formatPaisa(item.expense),
      formatPaisa(item.net),
    ]);
    return [
      `### ${copy("comparison")}`,
      markdownTable([copy("period"), copy("income"), copy("expenses"), copy("net")], rows),
    ].filter(Boolean).join("\n\n");
  }
  if (metrics.length !== 1) return "";
  const item = metrics[0];
  const rows = [
    [copy("income"), formatPaisa(item.income)],
    [copy("expenses"), formatPaisa(item.expense)],
    [copy("net"), formatPaisa(item.net)],
  ];
  if (item.capital !== 0n) rows.push([copy("capital"), formatPaisa(item.capital)]);
  if (item.withdrawals !== 0n) rows.push([copy("withdrawals"), formatPaisa(item.withdrawals)]);
  return [
    `### ${copy("verifiedSummary")} â€” ${periodLabel(item.period)}`,
    markdownTable([copy("metric"), copy("amount")], rows),
  ].filter(Boolean).join("\n\n");
}

export function createCategoryReport(
  groups: Array<{ name: string; amount: bigint; count: number }>,
  language: LedgerMateLanguage,
  label: string,
): string {
  if (!groups.length) return "";
  const copy = (key: Parameters<typeof ledgerMateCopy>[1]) => ledgerMateCopy(language, key);
  return [
    `### ${copy("income")} â€” ${label}`,
    markdownTable(
      [copy("category"), copy("amount"), copy("transactions")],
      groups.slice(0, 12).map((group) => [group.name, formatPaisa(group.amount), String(group.count)]),
    ),
  ].filter(Boolean).join("\n\n");
}

export function createTransactionReport(
  period: LedgerMatePeriod,
  transactions: Transaction[],
  language: LedgerMateLanguage,
): string {
  if (!transactions.length) return "";
  const copy = (key: Parameters<typeof ledgerMateCopy>[1]) => ledgerMateCopy(language, key);
  const visible = transactions.slice(0, TRANSACTION_DETAIL_LIMIT);
  const notice = transactions.length > visible.length
    ? `${copy("showing")} ${visible.length} ${copy("of")} ${transactions.length} ${copy("entries")}.`
    : "";
  return [
    `### ${copy("verifiedSummary")} â€” ${periodLabel(period)}`,
    notice,
    markdownTable(
      [copy("businessDate"), copy("type"), copy("category"), copy("amount"), copy("account"), copy("note")],
      visible.map((transaction) => [
        transaction.business_date,
        transaction.type,
        transaction.category_name || "Uncategorised",
        formatPaisa(BigInt(Math.trunc(Number(transaction.amount_paisa)))),
        transaction.account_name || "â€”",
        transaction.note || transaction.raw_text || "â€”",
      ]),
    ),
  ].filter(Boolean).join("\n\n");
}

export function createDirectAnswer(
  question: string,
  language: LedgerMateLanguage,
  metrics: PeriodMetrics[],
  voids: VoidPeriodResult[],
  topGroups: Array<{ name: string; amount: bigint; count: number }>,
  serviceMetrics?: { income: bigint; expense: bigint; transactionCount: number },
): string | undefined {
  if (voids.length === 1) {
    const item = voids[0];
    const label = item.period ? periodLabel(item.period) : allTimeLabel(language);
    if (language === "roman-urdu") {
      const verb = item.count === 1 ? "void hui hai" : "void hui hain";
      return item.count === 0
        ? `${label} mein koi transaction void nahi hui (0 records).`
        : `${label} mein ${item.count} transaction${item.count === 1 ? "" : "s"} ${verb}. Neeche detail aur wajah di hai.`;
    }
    if (language === "urdu") {
      return item.count === 0
        ? `${label} Ù…ÛŒÚº Ú©ÙˆØ¦ÛŒ Ù¹Ø±Ø§Ù†Ø²ÛŒÚ©Ø´Ù† void Ù†ÛÛŒÚº ÛÙˆØ¦ÛŒ (0 Ø±ÛŒÚ©Ø§Ø±Úˆ)Û”`
        : `${label} Ù…ÛŒÚº ${item.count} void action Ø¯Ø±Ø¬ ÛÙˆØ¦ÛŒÚºÛ” Ù†ÛŒÚ†Û’ ØªÙØµÛŒÙ„ Ø§ÙˆØ± ÙˆØ¬Û Ù…ÙˆØ¬ÙˆØ¯ ÛÛ’Û”`;
    }
    return item.count === 0
      ? `No transactions were voided during ${label} (0 matching records).`
      : `${item.count} transaction${item.count === 1 ? " was" : "s were"} voided during ${label}. Details and reasons are below.`;
  }

  if (metrics.length === 2 && isComparison(question)) {
    if (language === "roman-urdu") return "Dono muddaton ka verified ledger comparison neeche diya hai.";
    if (language === "urdu") return "Ø¯ÙˆÙ†ÙˆÚº Ù…Ø¯ØªÙˆÚº Ú©Ø§ ØªØµØ¯ÛŒÙ‚ Ø´Ø¯Û ledger Ù…ÙˆØ§Ø²Ù†Û Ù†ÛŒÚ†Û’ Ø¯ÛŒØ§ Ú¯ÛŒØ§ ÛÛ’Û”";
    return "Here is the verified ledger comparison for both periods.";
  }

  const metric = financialMetric(question);
  if (serviceMetrics && metric === "transaction-count") {
    const label = metrics[0] ? periodLabel(metrics[0].period) : allTimeLabel(language);
    if (language === "roman-urdu") return `${label} mein matching service records ki ${serviceMetrics.transactionCount} transactions hain.`;
    if (language === "urdu") return `${label} Ù…ÛŒÚº matching service records Ú©ÛŒ ${serviceMetrics.transactionCount} Ù¹Ø±Ø§Ù†Ø²ÛŒÚ©Ø´Ù†Ø² ÛÛŒÚºÛ”`;
    return `Shop Pro found ${serviceMetrics.transactionCount} matching service transactions during ${label}.`;
  }
  if (serviceMetrics && (metric === "income" || metric === "expense")) {
    const label = metrics[0] ? periodLabel(metrics[0].period) : allTimeLabel(language);
    const amount = metric === "income" ? serviceMetrics.income : serviceMetrics.expense;
    if (language === "roman-urdu") {
      const type = metric === "income" ? "income" : "expenses";
      return `${label} ke matching service records mein ${formatPaisa(amount)} ${type} record hue.`;
    }
    if (language === "urdu") {
      const type = metric === "income" ? "Ø¢Ù…Ø¯Ù†ÛŒ" : "Ø§Ø®Ø±Ø§Ø¬Ø§Øª";
      return `${label} Ú©Û’ matching service records Ù…ÛŒÚº ${formatPaisa(amount)} ${type} Ø±ÛŒÚ©Ø§Ø±Úˆ ÛÙˆØ¦Û’Û”`;
    }
    const type = metric === "income" ? "income" : "expenses";
    return `Shop Pro recorded ${formatPaisa(amount)} in ${type} matching the requested service during ${label}.`;
  }
  if (metric && metrics.length === 1) {
    const item = metrics[0];
    const label = periodLabel(item.period);
    if (metric === "transaction-count" && item.transactions) {
      const count = item.transactions.length;
      if (language === "roman-urdu") return `${label} mein ${count} active transaction${count === 1 ? "" : "s"} record hui.`;
      if (language === "urdu") return `${label} Ù…ÛŒÚº ${count} active Ù¹Ø±Ø§Ù†Ø²ÛŒÚ©Ø´Ù†Ø² Ø¯Ø±Ø¬ ÛÙˆØ¦ÛŒÚºÛ”`;
      return `Shop Pro recorded ${count} active transaction${count === 1 ? "" : "s"} during ${label}.`;
    }
    const amount = metric === "expense" ? item.expense : metric === "net" ? item.net : item.income;
    if (language === "roman-urdu") {
      if (metric === "expense") return `${label} ke total expenses ${formatPaisa(amount)} hain.`;
      if (metric === "net") return `${label} ka net result (income minus expenses) ${formatPaisa(amount)} hai.`;
      return `${label} mein Shop Pro ne ${formatPaisa(amount)} ki income / sales record ki.`;
    }
    if (language === "urdu") {
      if (metric === "expense") return `${label} Ú©Û’ Ú©Ù„ Ø§Ø®Ø±Ø§Ø¬Ø§Øª ${formatPaisa(amount)} ÛÛŒÚºÛ”`;
      if (metric === "net") return `${label} Ú©Ø§ Ø®Ø§Ù„Øµ Ù†ØªÛŒØ¬Û (Ø¢Ù…Ø¯Ù†ÛŒ Ù…Ù†ÙÛŒ Ø§Ø®Ø±Ø§Ø¬Ø§Øª) ${formatPaisa(amount)} ÛÛ’Û”`;
      return `${label} Ù…ÛŒÚº Shop Pro Ù†Û’ ${formatPaisa(amount)} Ø¢Ù…Ø¯Ù†ÛŒ / ÙØ±ÙˆØ®Øª Ø¯Ø±Ø¬ Ú©ÛŒÛ”`;
    }
    if (metric === "expense") return `Shop Pro recorded ${formatPaisa(amount)} in expenses during ${label}.`;
    if (metric === "net") return `The net result (income minus expenses) for ${label} is ${formatPaisa(amount)}.`;
    return `Shop Pro recorded ${formatPaisa(amount)} in income / sales during ${label}.`;
  }

  if (topGroups.length && /\b(most|highest|top|sab se zyada|zyada|best)\b/i.test(question)) {
    const top = topGroups[0];
    if (language === "roman-urdu") return `Sab se zyada income ${top.name} category mein hai: ${formatPaisa(top.amount)} (${top.count} entries).`;
    if (language === "urdu") return `Ø³Ø¨ Ø³Û’ Ø²ÛŒØ§Ø¯Û Ø¢Ù…Ø¯Ù†ÛŒ ${top.name} Ú©ÛŒÙ¹ÛŒÚ¯Ø±ÛŒ Ù…ÛŒÚº ÛÛ’: ${formatPaisa(top.amount)} (${top.count} Ø§Ù†Ø¯Ø±Ø§Ø¬Ø§Øª)Û”`;
    return `The highest income category is ${top.name}: ${formatPaisa(top.amount)} across ${top.count} entries.`;
  }
  return undefined;
}
