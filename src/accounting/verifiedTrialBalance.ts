import type { TrialBalanceAccount, TrialBalancePage } from "./readContracts";
import {
  exactReadMinor, nonNegativeReadMinor, readRecord, validateReadAccount,
} from "./verifiedReadValidation";
import {
  collectCertifiedRead, type CollectionOptions, type FinancialPageRpc, type VerifiedCollection,
} from "./verifiedReadCollection";

export type VerifiedTrialBalance = VerifiedCollection<TrialBalanceAccount> & {
  totals: TrialBalancePage["totals"];
};

type Totals = {
  openingDebit: bigint;
  openingCredit: bigint;
  debit: bigint;
  credit: bigint;
  closingDebit: bigint;
  closingCredit: bigint;
};

const zeroTotals = (): Totals => ({
  openingDebit: 0n, openingCredit: 0n,
  debit: 0n, credit: 0n, closingDebit: 0n, closingCredit: 0n,
});

const assertTotals = (value: unknown): Totals => {
  const t = readRecord(value, "TB totals");
  const totals: Totals = {
    openingDebit: nonNegativeReadMinor(t.opening_debit_minor, "opening debit"),
    openingCredit: nonNegativeReadMinor(t.opening_credit_minor, "opening credit"),
    debit: nonNegativeReadMinor(t.debit_minor, "period debit"),
    credit: nonNegativeReadMinor(t.credit_minor, "period credit"),
    closingDebit: nonNegativeReadMinor(t.closing_debit_minor, "closing debit"),
    closingCredit: nonNegativeReadMinor(t.closing_credit_minor, "closing credit"),
  };
  if (totals.openingDebit !== totals.openingCredit ||
      totals.debit !== totals.credit ||
      totals.closingDebit !== totals.closingCredit) {
    throw new Error("Certified Trial Balance totals are unbalanced.");
  }
  return totals;
};

/**
 * Assembles complete authenticated V2 TB rows. Existing-business legacy
 * openings remain excluded and MUST NOT be presented as certified company books.
 */
export async function readVerifiedTrialBalance(
  rpc: FinancialPageRpc,
  request: {
    p_organization_id: string;
    p_from_date: string;
    p_to_date: string;
    p_currency: string;
  },
  options?: CollectionOptions,
): Promise<VerifiedTrialBalance> {
  const totals = zeroTotals();
  let header: TrialBalancePage["totals"] | undefined;
  const seenAccounts = new Set<string>();
  const seenCodes = new Set<string>();
  const assembled = await collectCertifiedRead<TrialBalanceAccount>({
    rpc,
    request,
    options,
    expectedKind: "trial_balance",
    reportIdentity: (page) => {
      header = readRecord(page.totals, "TB total report") as
        unknown as TrialBalancePage["totals"];
      assertTotals(header);
      return header;
    },
    validateRow: (item) => {
      const row = readRecord(item, "TB row");
      validateReadAccount(row.account, request.p_organization_id);
      const account = readRecord(row.account, "TB account");
      const id = String(account.id);
      const code = String(account.code);
      if (seenAccounts.has(id) || seenCodes.has(code)) {
        throw new Error("Trial Balance account was duplicated across pages.");
      }
      seenAccounts.add(id);
      seenCodes.add(code);
      const opening = exactReadMinor(row.opening_minor, "TB opening");
      const dr = nonNegativeReadMinor(row.debit_minor, "TB debit");
      const cr = nonNegativeReadMinor(row.credit_minor, "TB credit");
      const closing = exactReadMinor(row.closing_minor, "TB closing");
      const closeDr = nonNegativeReadMinor(row.closing_debit_minor, "TB debit closing");
      const closeCr = nonNegativeReadMinor(row.closing_credit_minor, "TB credit closing");
      if (opening + dr - cr !== closing ||
          closeDr !== (closing > 0n ? closing : 0n) ||
          closeCr !== (closing < 0n ? -closing : 0n)) {
        throw new Error("Trial Balance row amounts do not reconcile.");
      }
      totals.openingDebit += opening > 0n ? opening : 0n;
      totals.openingCredit += opening < 0n ? -opening : 0n;
      totals.debit += dr;
      totals.credit += cr;
      totals.closingDebit += closeDr;
      totals.closingCredit += closeCr;
      return row as unknown as TrialBalanceAccount;
    },
    validateCompleted: () => {
      if (!header) throw new Error("Trial Balance totals are absent.");
      const server = assertTotals(header);
      for (const name of Object.keys(totals) as (keyof Totals)[]) {
        if (totals[name] !== server[name]) {
          throw new Error(`Trial Balance account rows do not match ${name} total.`);
        }
      }
    },
  });
  if (!header) throw new Error("Certified Trial Balance totals missing.");
  return { ...assembled, totals: header };
}
