import { ledgerService } from "./ledgerService";
import { getKarachiBusinessDate } from "../lib/dates";

/** Exact, narrow queries are answered without language-model arithmetic. */
export function formatLedgerMinorUnits(value: bigint, currency: string): string {
  const magnitude = value < 0n ? -value : value;
  const whole = (magnitude / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${value < 0n ? "−" : ""}${currency === "PKR" ? "Rs" : currency} ${whole}.${String(magnitude % 100n).padStart(2, "0")}`;
}
const integer = (value: number): bigint => {
  if (!Number.isSafeInteger(value)) throw new Error("The ledger contains an amount outside safe integer precision.");
  return BigInt(value);
};

export async function tryDirectLedgerAnswer(question: string, currency: string, today = getKarachiBusinessDate()): Promise<string | null> {
  const query = question.trim().toLowerCase().replace(/[?.!]+$/,"").replace(/\s+/g," ");
  const money = (value: bigint) => formatLedgerMinorUnits(value,currency);
  const daily = /^(aaj ki total sale kitni hai|aaj ki sale kitni hai|today's sales|today sales|what are today's sales|total sales today|today's income|income today)$/.test(query);
  const monthly = /^(is month ka operating result aur expense batao|is month ka profit aur expense batao|this month's income and expenses|this month operating result)$/.test(query);
  const balances = /^(cash aur bank balance kitna hai|cash and bank balances|what are my cash and bank balances)$/.test(query);
  if (!daily && !monthly && !balances) return null;
  if (balances) {
    const accounts = (await ledgerService.getPaymentAccounts({requireCloudSource:true})).filter(account => account.is_active);
    const sum = (type: string) => accounts.filter(account => account.type === type).reduce((total,account)=>total+integer(account.balance_paisa),0n);
    return `## Current recorded balances\n\n| Account type | Balance |\n| --- | ---: |\n| Cash | ${money(sum("CASH"))} |\n| Bank | ${money(sum("BANK"))} |\n\nSource: ${accounts.length} active cloud payment accounts retrieved for this response. These are operational balances, not bank statements or accrual profit. Verify individual balances in Accounts.`;
  }
  const start = daily ? today : today.slice(0,7)+"-01";
  const records = await ledgerService.getAllFilteredTransactions({startDate:start,endDate:today,status:"active"},{requireCloudSource:true});
  const sum = (type: string) => records.filter(row => row.type===type).reduce((total,row)=>total+integer(row.amount_paisa),0n);
  const income = sum("income"), expenses = sum("expense");
  const period = start===today ? today : `${start} through ${today}`;
  return [
    `## Recorded cashbook activity — ${period}`,
    "",
    daily ? `Recorded income: **${money(income)}**` : `| Metric | Amount |\n| --- | ---: |\n| Income | ${money(income)} |\n| Expenses | ${money(expenses)} |\n| Operating result | ${money(income-expenses)} |`,
    "",
    `Source: ${records.length} active posted cloud transactions; business dates ${period}. Open Transactions and use these dates to inspect records. Pending entries and internal transfers are excluded. Income is recorded cashbook income, not necessarily point-of-sale revenue; operating result is not accrual profit.`,
  ].join("\n");
}
