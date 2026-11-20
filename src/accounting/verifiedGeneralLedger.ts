import type { GeneralLedgerLine, GeneralLedgerPage } from "./readContracts";
import {
  exactReadMinor, nonNegativeReadMinor, readRecord, readString, validateReadAccount,
} from "./verifiedReadValidation";
import {
  collectCertifiedRead, type CollectionOptions, type FinancialPageRpc, type VerifiedCollection,
} from "./verifiedReadCollection";

export type GeneralLedgerRead = VerifiedCollection<GeneralLedgerLine> & {
  account: GeneralLedgerPage["account"];
  openingMinor: string;
  debitMinor: string;
  creditMinor: string;
  closingMinor: string;
};

/**
 * Assembles server-certified V2 GL only. No legacy balances, no guessed vouchers.
 * An injected RPC must be authenticated, isolated and return exactly PR #53's wire shape.
 */
export async function readVerifiedGeneralLedger(
  rpc: FinancialPageRpc,
  request: {
    p_organization_id: string;
    p_account_id: string;
    p_from_date: string;
    p_to_date: string;
    p_currency: string;
  },
  options?: CollectionOptions,
): Promise<GeneralLedgerRead> {
  const accountId = readString(request.p_account_id, "requested account");
  let account: GeneralLedgerPage["account"] | undefined;
  let opening = 0n;
  let debit = 0n;
  let credit = 0n;
  let closing = 0n;
  let running: bigint | undefined;
  let rowsDebit = 0n;
  let rowsCredit = 0n;
  const assembled = await collectCertifiedRead<GeneralLedgerLine>({
    rpc,
    request,
    options,
    expectedKind: "general_ledger",
    reportIdentity: (page) => {
      validateReadAccount(page.account, request.p_organization_id, accountId);
      account = page.account as GeneralLedgerPage["account"];
      opening = exactReadMinor(page.opening_minor, "GL opening");
      debit = nonNegativeReadMinor(page.debit_minor, "GL debit total");
      credit = nonNegativeReadMinor(page.credit_minor, "GL credit total");
      closing = exactReadMinor(page.closing_minor, "GL closing");
      if (opening + debit - credit !== closing) {
        throw new Error("GL reported opening/movement/closing do not reconcile.");
      }
      running ??= opening;
      return [page.account, page.opening_minor, page.debit_minor,
        page.credit_minor, page.closing_minor];
    },
    validateRow: (item) => {
      const row = readRecord(item, "GL transaction");
      const lineNo = row.line_no;
      if (typeof lineNo !== "number" || !Number.isSafeInteger(lineNo) ||
          lineNo < 1 || lineNo > 100 || row.account_id !== accountId) {
        throw new Error("GL row refers to an invalid account or line number.");
      }
      readString(row.journal_id, "GL journal");
      readString(row.intent_key, "GL intent");
      readString(row.audit_event_id, "GL audit event");
      readString(row.posted_by, "GL actor");
      readString(row.period_id, "GL fiscal period");
      readString(row.posted_at, "GL posting timestamp");
      const dr = nonNegativeReadMinor(row.debit_minor, "GL line debit");
      const cr = nonNegativeReadMinor(row.credit_minor, "GL line credit");
      if ((dr > 0n) === (cr > 0n)) {
        throw new Error("GL posting line has an invalid debit/credit side.");
      }
      running = (running ?? opening) + dr - cr;
      if (exactReadMinor(row.running_balance_minor, "GL running balance") !== running) {
        throw new Error("GL running balance does not reconcile across pages.");
      }
      rowsDebit += dr;
      rowsCredit += cr;
      return row as unknown as GeneralLedgerLine;
    },
    validateCompleted: () => {
      if (rowsDebit !== debit || rowsCredit !== credit || running !== undefined &&
          running !== closing || (running === undefined && opening !== closing)) {
        throw new Error("GL account period totals do not reconcile with source rows.");
      }
    },
  });
  if (!account) throw new Error("Verified GL account metadata is missing.");
  return { ...assembled, account, openingMinor: opening.toString(),
    debitMinor: debit.toString(), creditMinor: credit.toString(),
    closingMinor: closing.toString() };
}
