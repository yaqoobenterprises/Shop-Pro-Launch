import type { ChartAccount, JournalLineInput } from "./types";

const ACCOUNT_CLASSES = new Set<ChartAccount["accountClass"]>([
  "asset", "liability", "equity", "revenue",
  "cost_of_sales", "expense", "other_income", "other_expense",
]);

const CONTROL_CLASSES: Record<string, ChartAccount["accountClass"][]> = {
  cash: ["asset"],
  receivable: ["asset"],
  payable: ["liability"],
  inventory: ["asset"],
  tax: ["asset", "liability"],
};

/** Validate the complete company chart; no cross-company nodes, duplicate codes or parent cycles. */
export function assertValidChart(organizationId: string, accounts: ChartAccount[]): Map<string, ChartAccount> {
  if (!organizationId.trim()) throw new Error("A company ID is required.");
  const byId = new Map<string, ChartAccount>();
  const byCode = new Set<string>();

  for (const account of accounts) {
    if (account.organizationId !== organizationId) {
      throw new Error("Chart contains an account from another company.");
    }
    if (!account.id.trim() || byId.has(account.id)) {
      throw new Error("Chart account ID is missing or duplicated.");
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,31}$/.test(account.code)) {
      throw new Error("Chart account code must be a valid stable identifier.");
    }
    const code = account.code.toUpperCase();
    if (byCode.has(code)) throw new Error(`Duplicate account code: ${account.code}`);
    if (!account.name.trim() || account.name.length > 160) {
      throw new Error("Chart account names must be 1–160 characters.");
    }
    if (!ACCOUNT_CLASSES.has(account.accountClass)) {
      throw new Error("Chart account class is not recognized.");
    }
    if (typeof account.isPosting !== "boolean" || typeof account.isActive !== "boolean") {
      throw new Error("Chart account status fields must be explicit.");
    }
    if (account.normalSide !== "debit" && account.normalSide !== "credit") {
      throw new Error("Every chart account must declare its normal side.");
    }
    if (account.controlRole) {
      if (!account.isPosting || !CONTROL_CLASSES[account.controlRole]?.includes(account.accountClass)) {
        throw new Error("Control accounts require a compatible posting leaf.");
      }
    }
    byId.set(account.id, account);
    byCode.add(code);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (account: ChartAccount): void => {
    if (visited.has(account.id)) return;
    if (visiting.has(account.id)) throw new Error("Chart has a parent cycle.");
    visiting.add(account.id);
    if (account.parentId !== null) {
      const parent = byId.get(account.parentId);
      if (!parent) throw new Error("Chart parent account is missing.");
      if (parent.accountClass !== account.accountClass || parent.isPosting) {
        throw new Error("Chart child must belong to a non-posting parent of the same class.");
      }
      visit(parent);
    }
    visiting.delete(account.id);
    visited.add(account.id);
  };
  for (const account of accounts) visit(account);

  return byId;
}

/**
 * Client-side validation only: does NOT replace server authorization,
 * fiscal locks, matching inventory detail or atomic journal posting.
 */
export function assertPostingAccount(
  byId: Map<string, ChartAccount>,
  accountId: string,
  line?: JournalLineInput,
): ChartAccount {
  const account = byId.get(accountId);
  if (!account) throw new Error("Journal references a missing or foreign company account.");
  if (!account.isPosting || !account.isActive) {
    throw new Error("Journal requires an active posting account, not a heading.");
  }
  if (line && (account.controlRole === "receivable" || account.controlRole === "payable")) {
    if (!line.partyId?.trim() || !line.openItemId?.trim()) {
      throw new Error("Receivable/payable posting requires a party and open-item reference.");
    }
  }
  if (line && account.controlRole === "inventory" && !line.stockMovementId?.trim()) {
    throw new Error("Inventory posting requires a source stock movement.");
  }
  return account;
}
