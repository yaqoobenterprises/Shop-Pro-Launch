import { Category, LedgerAccount } from "../types/ledger";
import { ledgerService } from "./ledgerService";

export interface QuickExpenseCommand {
  amountPaisa: number;
  categoryId: string;
  accountId: string;
  categories: Category[];
  accounts: LedgerAccount[];
  description: string;
  referenceNumber?: string;
  notes?: string;
  businessDate: string;
  userId?: string;
  createdByName: string;
}

export async function recordQuickExpense(input: QuickExpenseCommand): Promise<{
  isQueuedOffline: boolean;
  accountName: string;
}> {
  if (!Number.isSafeInteger(input.amountPaisa) || input.amountPaisa <= 0) {
    throw new Error("Enter a valid positive expense amount.");
  }

  const category = input.categories.find(
    (item) => item.id === input.categoryId && item.kind === "expense" && item.is_active,
  );
  const account = input.accounts.find(
    (item) => item.id === input.accountId && item.is_active,
  );
  if (!category || !account) {
    throw new Error("Choose an active expense category and payment account.");
  }
  if (!input.userId) {
    throw new Error("Sign in again before recording this expense.");
  }

  const detailParts = [
    input.description.trim(),
    input.referenceNumber?.trim() ? `Receipt reference: ${input.referenceNumber.trim()}` : "",
    input.notes?.trim() ? `Notes: ${input.notes.trim()}` : "",
  ].filter(Boolean);
  const rawText = `Quick expense: ${detailParts.join(" | ")}`;
  const note = detailParts.slice(1).join(" | ") || null;

  // Quick Expense uses the same durable draft and atomic posting RPC as the
  // primary ledger, so its balance movement cannot diverge from ledger reports.
  const draft = await ledgerService.createTransactionDraft(
    {
      type: "expense",
      amountPaisa: input.amountPaisa,
      categoryId: category.id,
      categoryName: category.name,
      businessDate: input.businessDate,
      rawText,
      note,
      createdByName: input.createdByName,
    },
    input.userId,
  );
  const posting = await ledgerService.postTransactionDraft(draft.id, account.id);
  return { isQueuedOffline: posting.isQueuedOffline, accountName: account.name };
}
