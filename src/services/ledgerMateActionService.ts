import type { DailySummary, Transaction } from "../types/ledger";
import { ledgerService } from "./ledgerService";
import { resolveLedgerMatePeriods } from "./ledgerMateDateResolver";
import { formatAmount, type ChatMessage } from "./ledgerMateChatUtils";

const VERIFIED_CLOUD_READ = { requireCloudSource: true } as const;

export type PendingAction =
  | { kind: "create"; payload: Parameters<typeof ledgerService.createTransactionDraft>[0]; accountId: string; preview: string; draftId?: string; submitted?: boolean }
  | { kind: "edit"; transaction: Transaction; amountPaisa: number; preview: string; submitted?: boolean }
  | { kind: "void"; transaction: Transaction; preview: string; submitted?: boolean };

function resolvedDay(question: string, messages: ChatMessage[], currentDate: string): string | null {
  const resolution = resolveLedgerMatePeriods(question, messages, currentDate);
  const period = resolution.periods[0];
  return period?.kind === "day" ? period.startDate : null;
}

function normalizedDescriptor(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function narrowTransactionMatches(transactions: Transaction[], question: string): Transaction[] {
  const text = normalizedDescriptor(question);
  let candidates = transactions;
  const requestedType = /\b(expense|kharcha|kharch|purchase|bought|paid)\b/.test(text)
    ? "expense"
    : /\b(income|sale|sales|earning|kamai|bikri|received)\b/.test(text)
      ? "income"
      : null;
  if (requestedType) {
    candidates = candidates.filter((transaction) => transaction.type === requestedType);
  }

  const described = candidates.filter((transaction) =>
    [transaction.category_name, transaction.note, transaction.raw_text]
      .filter((value): value is string => Boolean(value))
      .some((value) => {
        const descriptor = normalizedDescriptor(value);
        return descriptor.length >= 3 && text.includes(descriptor);
      }),
  );
  return described.length ? described : candidates;
}

function removeDateFromAmountText(content: string): string {
  const monthName = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const datePattern = new RegExp([
    String.raw`\b20\d{2}-(?:0?[1-9]|1[0-2])-(?:0?[1-9]|[12]\d|3[01])\b`,
    String.raw`\b(?:[0-2]?\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.]20\d{2}\b`,
    String.raw`\b(?:[0-2]?\d|3[01])\s+${monthName}\.?[,]?\s+20\d{2}\b`,
    String.raw`\b${monthName}\.?\s+(?:[0-2]?\d|3[01])[,]?\s+20\d{2}\b`,
  ].join("|"), "gi");
  return content.replace(datePattern, " ");
}

export async function prepareLedgerMateAction(
  content: string,
  messages: ChatMessage[],
  summary: DailySummary,
): Promise<{ pending: PendingAction } | { clarification: string } | null> {
  const question = content.toLowerCase();
  const isCreate = /\b(add|record|enter|save|jama|likh\s*do|darj)\b/.test(question);
  const isEdit = /\b(edit|change|update|correct|tabdeel|theek\s*kar|badal)\b/.test(question) || /\b[\d,]+(?:\.\d{1,2})?\s*(?:to|se|ko)\s*[\d,]+(?:\.\d{1,2})?\s*(?:kar\s*do)?\b/.test(question);
  const isVoid = /\b(delete|remove|void|hata|hatao|cancel|mita)\b/.test(question);
  if (!isCreate && !isEdit && !isVoid) return null;
  if (Number(isCreate) + Number(isEdit) + Number(isVoid) > 1) {
    return { clarification: "I found more than one possible ledger action. Please send only one request: add, edit, or void." };
  }

  const date = resolvedDay(content, messages, summary.business_date);
  const moneyPattern = /(?:rs\.?|pkr|rupees?)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|pkr|rupees?)/gi;
  const amountSource = removeDateFromAmountText(content);
  const moneyValues = [...amountSource.matchAll(moneyPattern)]
    .map((match) => Number((match[1] || match[2]).replace(/,/g, "")))
    .filter((value) => Number.isSafeInteger(Math.round(value * 100)) && value > 0)
    .map((value) => Math.round(value * 100));

  if (isCreate) {
    const amountPaisa = moneyValues[0];
    if (!amountPaisa) return { clarification: "Entry ka amount bata dein, for example: Rs 1,250.00." };
    const type: "income" | "expense" | null = /\b(expense|kharcha|kharch|purchase|bought|buy|paid|payment out)\b/.test(question)
      ? "expense"
      : /\b(income|sale|sales|earning|kamai|bikri|received|stamp|printing|print|copy|photocopy)\b/.test(question)
        ? "income"
        : null;
    if (!type) return { clarification: "Ye income/sale hai ya expense? Please confirm the transaction type." };
    const [categories, accounts] = await Promise.all([
      ledgerService.getCategories(VERIFIED_CLOUD_READ),
      ledgerService.getPaymentAccounts(VERIFIED_CLOUD_READ),
    ]);
    const activeCategories = categories.filter((item) => item.is_active && item.kind === type);
    const categoryHint = /stamp/.test(question) ? "stamp"
      : /lamination/.test(question) ? "lamination"
        : /paper/.test(question) ? "paper"
          : /print|copy|photocopy|b\/w/.test(question) ? "print" : "";
    const categoryMatches = categoryHint ? activeCategories.filter((item) => item.name.toLowerCase().includes(categoryHint)) : [];
    if (categoryHint && categoryMatches.length > 1) return { clarification: `Multiple ${categoryHint} categories are available. Please name the exact category shown in Shop Pro.` };
    if (categoryHint && categoryMatches.length === 0) {
      return { clarification: `No active ${type} category matches “${categoryHint}”. Please name an existing Shop Pro category before recording this entry.` };
    }
    const defaults = activeCategories.filter((item) => item.is_default);
    const category = categoryMatches[0] || (defaults.length === 1 ? defaults[0] : activeCategories.length === 1 ? activeCategories[0] : null);
    if (!category) return { clarification: `Please choose one of the active ${type} categories in Shop Pro; no single default category is configured.` };
    const activeAccounts = accounts.filter((item) => item.is_active);
    const accountHint = /\bbank\b/.test(question) ? "bank"
      : /\bwallet\b/.test(question) ? "wallet"
        : /\bcash\b/.test(question) ? "cash" : null;
    const accountMatches = accountHint === "bank" ? activeAccounts.filter((item) => item.type === "BANK" || item.name.toLowerCase().includes("bank"))
      : accountHint === "wallet" ? activeAccounts.filter((item) => item.type === "DIGITAL_WALLET")
        : accountHint === "cash" ? activeAccounts.filter((item) => item.type === "CASH" || item.name.toLowerCase().includes("cash"))
          : [];
    if (accountMatches.length > 1) return { clarification: "Multiple payment accounts match. Please name the exact Cash or Bank account." };
    if (accountHint && accountMatches.length === 0) return { clarification: `No active ${accountHint} account matches in this Shop Pro organization. Please choose an existing payment account.` };
    const defaultAccounts = activeAccounts.filter((item) => item.is_default);
    const account = accountMatches[0] || (defaultAccounts.length === 1 ? defaultAccounts[0] : activeAccounts.length === 1 ? activeAccounts[0] : null);
    if (!account) return { clarification: "Please choose the payment account; Shop Pro has multiple active accounts and no single default." };
    if (!date && /\b20\d{2}\b/.test(question)) return { clarification: "Date samajh nahi aayi. Please write a valid date like 21 Nov 2026 or 21-11-2026." };
    const businessDate = date || summary.business_date;
    if (businessDate > summary.business_date) return { clarification: "Future dated entries are not available through LedgerMate. Please use today or an earlier date." };
    const payload = {
      type, amountPaisa, categoryId: category.id, categoryName: category.name, businessDate,
      note: content.trim(), rawText: content.trim(), createdByName: "LedgerMate AI",
    };
    return { pending: { kind: "create", payload, accountId: account.id, preview: [
      `Type: ${type === "income" ? "Income" : "Expense"}`, `Amount: ${formatAmount(amountPaisa)}`,
      `Date: ${businessDate}`, `Category: ${category.name}`, `Payment account: ${account.name}`,
    ].join("\n") } };
  }

  if (!date) return { clarification: "Kis date wali transaction? Please include its date, for example 5 Nov 2026." };
  if (isEdit) {
    const change = amountSource.match(/(?:rs\.?|pkr)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:to|se|ko)\s*(?:rs\.?|pkr)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    const oldPaisa = moneyValues.length >= 2 ? moneyValues[0] : change ? Math.round(Number(change[1].replace(/,/g, "")) * 100) : 0;
    const newPaisa = moneyValues.length >= 2 ? moneyValues[1] : change ? Math.round(Number(change[2].replace(/,/g, "")) * 100) : 0;
    if (!oldPaisa || !newPaisa || !Number.isSafeInteger(oldPaisa) || !Number.isSafeInteger(newPaisa)) return { clarification: "Edit ke liye old amount aur new amount likhein. Example: 5 Nov 2026 ki Rs 500 wali entry Rs 700 kar dein." };
    const transactions = await ledgerService.getAllFilteredTransactions(
      { startDate: date, endDate: date, status: "active" },
      VERIFIED_CLOUD_READ,
    );
    const matches = narrowTransactionMatches(
      transactions.filter((transaction) => Number(transaction.amount_paisa) === oldPaisa),
      content,
    );
    if (matches.length !== 1) return { clarification: matches.length ? "Is date par same amount ki multiple entries hain. Category ya note bhi bata dein." : "Is date par ye active transaction nahi mili." };
    const transaction = matches[0];
    return { pending: { kind: "edit", transaction, amountPaisa: newPaisa, preview: [
      `Type: ${transaction.type}`, `Date: ${transaction.business_date}`, `Category: ${transaction.category_name || "Uncategorised"}`,
      `Payment account: ${transaction.account_name || "Unknown"}`, `Amount: ${formatAmount(oldPaisa)} → ${formatAmount(newPaisa)}`,
    ].join("\n") } };
  }

  const amount = moneyValues[0] || (() => {
    const loose = amountSource.match(/\b([\d,]+)\s*(?:wali|ka|ki)\s*(?:transaction|entry|sale|expense)\b/i);
    return loose ? Math.round(Number(loose[1].replace(/,/g, "")) * 100) : undefined;
  })();
  const transactions = await ledgerService.getAllFilteredTransactions(
    { startDate: date, endDate: date, status: "active" },
    VERIFIED_CLOUD_READ,
  );
  const matches = narrowTransactionMatches(
    amount ? transactions.filter((transaction) => Number(transaction.amount_paisa) === amount) : transactions,
    content,
  );
  if (matches.length !== 1) return { clarification: matches.length ? "Is date par multiple transactions hain. Amount, category, ya note bata dein taake ghalat entry void na ho." : "Is date par matching active transaction nahi mili." };
  const transaction = matches[0];
  return { pending: { kind: "void", transaction, preview: [
    "Action: Void transaction (audit history will be retained)", `Type: ${transaction.type}`,
    `Amount: ${formatAmount(transaction.amount_paisa)}`, `Date: ${transaction.business_date}`,
    `Category: ${transaction.category_name || "Uncategorised"}`, `Payment account: ${transaction.account_name || "Unknown"}`,
  ].join("\n") } };
}
