import { afterEach, describe, expect, it, vi } from "vitest";
import { ledgerService } from "../src/services/ledgerService";
import { setSecurityPrincipal } from "../src/lib/security";
import {
  dequeueOfflineTransaction,
  enqueueOfflineTransaction,
  type QueuedTransaction,
} from "../src/services/offlineQueue";
import { LedgerAccount, Transaction } from "../src/types/ledger";

const organizationId = "org-yaqoob-001";
const ownerId = "test-owner";
const queuedKeys: string[] = [];

const queuedTransaction = (overrides: Partial<QueuedTransaction> = {}): QueuedTransaction => ({
  id: "queued-entry",
  idempotencyKey: "queued-entry-key",
  organizationId,
  createdBy: ownerId,
  accountId: "account-1",
  type: "income",
  amountPaisa: 3000,
  categoryId: "category-print",
  categoryName: "Printing",
  businessDate: "2026-10-04",
  deviceEntryTime: "2026-10-04T05:00:00.000Z",
  note: null,
  rawText: "Supplier invoice 42",
  createdByName: "Test Owner",
  adjustmentDir: null,
  status: "queued",
  attempts: 0,
  createdAt: Date.now(),
  ...overrides,
});

const enqueue = async (item: QueuedTransaction) => {
  queuedKeys.push(item.idempotencyKey);
  await enqueueOfflineTransaction(item);
};

afterEach(async () => {
  setSecurityPrincipal(null);
  for (const key of queuedKeys.splice(0)) await dequeueOfflineTransaction(key);
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

describe("unified Overview and Reports data", () => {
  it("filters offline entries by account, date and searchable description", async () => {
    setSecurityPrincipal({
      id: ownerId,
      organizationId,
      role: "OWNER",
      fullName: "Test Owner",
    });
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueue(queuedTransaction({ id: "account-one", idempotencyKey: "account-one-key" }));
    await enqueue(queuedTransaction({
      id: "account-two",
      idempotencyKey: "account-two-key",
      accountId: "account-2",
    }));
    await enqueue(queuedTransaction({
      id: "other-description",
      idempotencyKey: "other-description-key",
      accountId: "account-1",
      rawText: "Walk-in cash sale",
    }));

    const result = await ledgerService.getFilteredTransactions({
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      accountId: "account-1",
      searchQuery: "invoice",
      status: "active",
    });

    expect(result.count).toBe(1);
    expect(result.transactions.map((item) => item.id)).toEqual(["account-one"]);
  });

  it("merges pending offline entries into all-period reports without double counting or crossing shops", async () => {
    setSecurityPrincipal({
      id: ownerId,
      organizationId,
      role: "OWNER",
      fullName: "Test Owner",
    });
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await enqueue(queuedTransaction({
      id: "already-on-server-local-copy",
      idempotencyKey: "cloud-idempotency-key",
    }));
    await enqueue(queuedTransaction({
      id: "offline-new",
      idempotencyKey: "offline-new-key",
    }));
    await enqueue(queuedTransaction({
      id: "wrong-account",
      idempotencyKey: "wrong-account-key",
      accountId: "account-2",
    }));
    await enqueue(queuedTransaction({
      id: "wrong-shop",
      idempotencyKey: "wrong-shop-key",
      organizationId: "another-shop",
    }));

    const cloudTransaction = {
      id: "cloud-entry",
      type: "income",
      amount_paisa: 3000,
      category_id: "category-print",
      account_id: "account-1",
      business_date: "2026-10-04",
      device_entry_time: "2026-10-04T05:00:00.000Z",
      note: null,
      raw_text: "Supplier invoice 42",
      status: "active",
      idempotency_key: "cloud-idempotency-key",
      created_by: ownerId,
      created_by_name: "Test Owner",
    } as Transaction;
    vi.spyOn(ledgerService, "getFilteredTransactions").mockResolvedValue({
      transactions: [cloudTransaction],
      count: 1,
    });
    vi.spyOn(ledgerService, "getPaymentAccounts").mockResolvedValue([] as LedgerAccount[]);

    const result = await ledgerService.getAllFilteredTransactions({
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      accountId: "account-1",
      status: "active",
    });

    expect(result.map((item) => item.id)).toEqual(["cloud-entry", "offline-new"]);
  });
});
