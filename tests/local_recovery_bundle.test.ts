import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  createLocalRecoveryBundle,
  restoreLocalRecoveryBundle,
  validateLocalRecoveryBundle,
} from "../src/services/localRecoveryBundle";
import type { QueuedTransaction } from "../src/services/offlineQueue";
import type { TransactionDraft } from "../src/types/ledger";

beforeEach(() => {
  vi.stubGlobal("crypto", {
    subtle: {
      digest: async (_algorithm: string, data: BufferSource) => {
        const bytes = data instanceof ArrayBuffer
          ? Buffer.from(data)
          : Buffer.from(data as Uint8Array);
        return Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer;
      },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

function queuedTransaction(
  organizationId: string | undefined,
  id: string,
): QueuedTransaction {
  return {
    id,
    idempotencyKey: `key-${id}`,
    organizationId,
    type: "income",
    amountPaisa: 1000,
    categoryId: null,
    businessDate: "2026-10-11",
    deviceEntryTime: "2026-10-11T00:00:00.000Z",
    rawText: "income 10",
    createdByName: "Cashier",
    status: "queued",
    attempts: 0,
    createdAt: 1,
  };
}

function offlineDraft(organizationId: string): TransactionDraft {
  return {
    id: `draft-${organizationId}`,
    organization_id: organizationId,
    type: "income",
    amount_paisa: 1000,
    category_id: null,
    business_date: "2026-10-11",
    device_entry_time: "2026-10-11T00:00:00.000Z",
    raw_text: "income 10",
    created_by: "user-1",
    created_by_name: "Cashier",
    idempotency_key: `draft-key-${organizationId}`,
    created_at: "2026-10-11T00:00:00.000Z",
  };
}

describe("local recovery bundle", () => {
  it("preserves only this shop's pending work and validates its checksum", async () => {
    const bundle = await createLocalRecoveryBundle(
      "shop-1",
      [
        queuedTransaction("shop-1", "local-1"),
        queuedTransaction("shop-2", "foreign-1"),
        queuedTransaction(undefined, "legacy-unscoped"),
      ],
      [offlineDraft("shop-1"), offlineDraft("shop-2")],
      null,
      false,
      "2026-10-11T00:00:00.000Z",
    );

    expect(bundle.indexedDb.queuedTransactions.map((item) => item.id)).toEqual(["local-1"]);
    expect(bundle.indexedDb.offlineDrafts.map((draft) => draft.organization_id)).toEqual(["shop-1"]);
    expect(bundle.excluded).toContain(
      "1 legacy queued item(s) without a shop ID; omitted to prevent cross-shop export",
    );
    await expect(validateLocalRecoveryBundle(bundle, "shop-1")).resolves.toEqual(bundle);
  });

  it("rejects tampered contents and bundles for another organization", async () => {
    const bundle = await createLocalRecoveryBundle(
      "shop-1",
      [queuedTransaction("shop-1", "local-1")],
      [],
      null,
      false,
      "2026-10-11T00:00:00.000Z",
    );
    const tampered = structuredClone(bundle);
    tampered.indexedDb.queuedTransactions[0].amountPaisa = 999_999;

    await expect(validateLocalRecoveryBundle(tampered, "shop-1"))
      .rejects.toThrow("checksum verification failed");
    await expect(validateLocalRecoveryBundle(bundle, "shop-2"))
      .rejects.toThrow("Invalid local recovery bundle or organization");
  });

  it("restores pending work idempotently without duplicating entries", async () => {
    let queue: QueuedTransaction[] = [];
    let drafts: TransactionDraft[] = [];
    const bundle = await createLocalRecoveryBundle(
      "shop-1",
      [queuedTransaction("shop-1", "local-1")],
      [offlineDraft("shop-1")],
      null,
      false,
      "2026-10-11T00:00:00.000Z",
    );
    const dependencies = {
      getQueue: async () => queue,
      getDrafts: async () => drafts,
      saveQueueItem: async (item: QueuedTransaction) => {
        queue = [...queue, item];
      },
      saveDraft: async (draft: TransactionDraft) => {
        drafts = [...drafts, draft];
      },
    };

    await expect(
      restoreLocalRecoveryBundle(bundle, "shop-1", dependencies),
    ).resolves.toEqual({ queuedTransactions: 1, offlineDrafts: 1 });
    await expect(
      restoreLocalRecoveryBundle(bundle, "shop-1", dependencies),
    ).resolves.toEqual({ queuedTransactions: 0, offlineDrafts: 0 });
    expect(queue).toHaveLength(1);
    expect(drafts).toHaveLength(1);
  });

  it("rejects conflicting idempotency keys before changing existing work", async () => {
    const existing = queuedTransaction("shop-1", "local-1");
    const conflict = { ...existing, amountPaisa: existing.amountPaisa + 1 };
    const bundle = await createLocalRecoveryBundle(
      "shop-1",
      [existing],
      [offlineDraft("shop-1")],
      null,
      false,
      "2026-10-11T00:00:00.000Z",
    );
    const saveDraft = vi.fn(async () => {});

    await expect(
      restoreLocalRecoveryBundle(bundle, "shop-1", {
        getQueue: async () => [conflict],
        getDrafts: async () => [],
        saveQueueItem: vi.fn(async () => {}),
        saveDraft,
      }),
    ).rejects.toThrow("conflicts with existing local work");
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("refuses SQLite restoration without an authorized restore handler", async () => {
    const bundle = await createLocalRecoveryBundle(
      "shop-1",
      [queuedTransaction("shop-1", "local-1")],
      [],
      { format: "YAQOOB_SQLITE_BACKUP_V1" },
      false,
      "2026-10-11T00:00:00.000Z",
    );
    const saveQueueItem = vi.fn(async () => {});

    await expect(
      restoreLocalRecoveryBundle(bundle, "shop-1", {
        getQueue: async () => [],
        getDrafts: async () => [],
        saveQueueItem,
        saveDraft: vi.fn(async () => {}),
      }),
    ).rejects.toThrow("not authorized to restore the SQLite backup");
    expect(saveQueueItem).not.toHaveBeenCalled();
  });
});
