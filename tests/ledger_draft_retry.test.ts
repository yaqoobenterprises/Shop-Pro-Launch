import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as supabaseLib from "../src/lib/supabase";
import { setSecurityPrincipal } from "../src/lib/security";
import { ledgerService } from "../src/services/ledgerService";
import { cacheAccounts } from "../src/services/offlineAccountStore";
import { getOfflineDrafts, removeOfflineDraft } from "../src/services/offlineDraftStore";
import { LedgerAccount } from "../src/types/ledger";

const organizationId = "org-ambiguous-draft-retry";
const creatorId = "draft-retry-owner";
const timestamp = "2026-10-04T05:00:00Z";
const draftIds: string[] = [];

beforeEach(() => {
  vi.spyOn(supabaseLib, "hasConfiguredCloudSession").mockImplementation(async (userId) => Boolean(
    userId && supabaseLib.isSupabaseConfigured() &&
    (typeof navigator === "undefined" || navigator.onLine),
  ));
});

afterEach(async () => {
  for (const id of draftIds.splice(0)) await removeOfflineDraft(id);
  setSecurityPrincipal(null);
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

function setOwner() {
  setSecurityPrincipal({
    id: creatorId,
    organizationId,
    role: "OWNER",
    fullName: "Test Owner",
  });
}

function makeAccount(id: string): LedgerAccount {
  return {
    id,
    organization_id: organizationId,
    name: "Retry Test Wallet",
    type: "CASH",
    balance_paisa: 9000,
    current_balance: 90,
    opening_balance: 90,
    is_active: true,
    is_default: false,
    created_at: timestamp,
  };
}

describe("durable draft posting retries", () => {
  it("retains an online draft and retries an ambiguous commit through the same idempotent RPC", async () => {
    setOwner();
    vi.spyOn(supabaseLib, "isSupabaseConfigured").mockReturnValue(true);
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const account = makeAccount("ambiguous-draft-account");
    await cacheAccounts([account]);

    let upsertedDraft: Record<string, unknown> | null = null;
    const draftQuery = {
      upsert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        upsertedDraft = payload;
        return draftQuery;
      }),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(async () => ({ data: upsertedDraft, error: null })),
    };
    let draftId = "";
    let databaseCommitCount = 0;
    const serverTransaction = {
      id: "ambiguous-draft-posted-tx",
      account_id: account.id,
      amount_paisa: 2500,
    };
    const rpc = vi.fn().mockImplementation(async (
      functionName: string,
      args: { draft_id: string; selected_account_id: string },
    ) => {
      expect(functionName).toBe("post_transaction_draft");
      expect(args).toEqual({ draft_id: draftId, selected_account_id: account.id });
      if (databaseCommitCount === 0) {
        databaseCommitCount += 1;
        // The server commits, but the client receives a network failure response.
        return { data: null, error: new TypeError("Failed to fetch") };
      }
      return {
        data: { ...serverTransaction, idempotency_key: `draft-${draftId}` },
        error: null,
      };
    });
    const from = vi.fn().mockReturnValue(draftQuery);
    vi.spyOn(supabaseLib, "getSupabaseClient").mockReturnValue({ from, rpc } as never);

    const draft = await ledgerService.createTransactionDraft({
      type: "expense",
      amountPaisa: 2500,
      categoryId: "category-expense",
      categoryName: "Supplies",
      businessDate: "2026-10-04",
      rawText: "Quick expense: Supplies",
      createdByName: "Test Owner",
      note: "Receipt reference: INV-8",
    }, creatorId);
    draftId = draft.id;
    draftIds.push(draft.id);

    expect((await getOfflineDrafts(organizationId)).map((item) => item.id)).toContain(draft.id);
    const directRecord = vi.spyOn(ledgerService, "recordTransaction");

    const firstAttempt = await ledgerService.postTransactionDraft(draft.id, account.id);
    expect(firstAttempt).toEqual({ isQueuedOffline: true });
    expect((await getOfflineDrafts(organizationId)).find((item) => item.id === draft.id))
      .toMatchObject({ pending_account_id: account.id });
    expect(directRecord).not.toHaveBeenCalled();

    const retry = await ledgerService.postTransactionDraft(draft.id, account.id);
    expect(retry.transaction).toMatchObject({
      ...serverTransaction,
      idempotency_key: `draft-${draft.id}`,
    });
    expect(retry.isQueuedOffline).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(databaseCommitCount).toBe(1);
    expect(await getOfflineDrafts(organizationId)).toEqual([]);
    expect(from).toHaveBeenCalledTimes(3);
    expect(from.mock.calls.every(([table]) => table === "transaction_drafts")).toBe(true);
    expect(directRecord).not.toHaveBeenCalled();
  });

  it("does not convert an offline draft RPC failure into a second direct transaction during queue flushing", async () => {
    setOwner();
    vi.spyOn(supabaseLib, "isSupabaseConfigured").mockReturnValue(true);
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const account = makeAccount("flush-draft-account");
    await cacheAccounts([account]);

    const draft = await ledgerService.createTransactionDraft({
      type: "expense",
      amountPaisa: 1250,
      categoryId: "category-expense",
      categoryName: "Supplies",
      businessDate: "2026-10-04",
      rawText: "Quick expense: Supplies",
      createdByName: "Test Owner",
    }, creatorId);
    draftIds.push(draft.id);
    await ledgerService.postTransactionDraft(draft.id, account.id);

    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const draftQuery = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: draft, error: null }),
    };
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: new TypeError("Failed to fetch"),
    });
    const from = vi.fn().mockReturnValue(draftQuery);
    vi.spyOn(supabaseLib, "getSupabaseClient").mockReturnValue({ from, rpc } as never);
    const directRecord = vi.spyOn(ledgerService, "recordTransaction");

    const flush = await ledgerService.flushOfflineQueue();

    expect(flush.syncedCount).toBe(0);
    expect(flush.errors).toHaveLength(1);
    expect((await getOfflineDrafts(organizationId)).find((item) => item.id === draft.id))
      .toMatchObject({ pending_account_id: account.id });
    expect(rpc).toHaveBeenCalledWith("post_transaction_draft", {
      draft_id: draft.id,
      selected_account_id: account.id,
    });
    expect(from.mock.calls.map(([table]) => table)).toEqual(["transaction_drafts"]);
    expect(directRecord).not.toHaveBeenCalled();
  });
});
