import {spawnSync} from "node:child_process";
import {randomUUID, webcrypto} from "node:crypto";
import {mkdtempSync, writeFileSync, unlinkSync, rmdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, expect, it, vi} from "vitest";
import {enqueueOfflineTransaction, getOfflineQueue, dequeueOfflineTransaction, type QueuedTransaction} from "../src/services/offlineQueue";
import {createLocalRecoveryBundle, restoreLocalRecoveryBundle} from "../src/services/localRecoveryBundle";
import {createE2EHarness} from "./support/aqvoraE2EHarness";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); sessionStorage.clear(); });

it("refuses to call a skipped E2E suite a successful release verification", () => {
  const env = {...process.env};
  delete env.AQVORA_DISPOSABLE_STACK; delete env.AQVORA_LOCAL_SUPABASE_STATUS; delete env.AQVORA_E2E_RESTORE_CONTAINER;
  const result = spawnSync(process.execPath, [join(process.cwd(), "scripts/run_release_e2e.mjs")], {env, encoding: "utf8"});
  expect(result.status).toBe(1); expect(result.stderr).toContain("refusing a skipped green run");
});

it("rejects a hosted status configuration before any Auth or database connection", async () => {
  vi.stubEnv("AQVORA_DISPOSABLE_STACK", "1");
  const network = vi.spyOn(globalThis, "fetch");
  const dir = mkdtempSync(join(tmpdir(), "aqvora-e2e-guard-")), path = join(dir, "status.json");
  try {
    writeFileSync(path, JSON.stringify({API_URL: "https://business.invalid", DB_URL: "postgresql://test@business.invalid/postgres"}));
    await expect(createE2EHarness(path)).rejects.toThrow("Loopback test services required");
    expect(network).not.toHaveBeenCalled();
  } finally { unlinkSync(path); rmdirSync(dir); }
});

it("keeps legacy queued work and original V2 intent intact while both financial writers are disabled", async () => {
  vi.resetModules();
  vi.stubGlobal("crypto", {randomUUID, subtle: webcrypto.subtle});
  for (const name of ["VITE_ENABLE_AQVORA_STAGING_FINANCIAL_ISSUE", "VITE_ENABLE_AQVORA_STAGING_RECEIPT_POSTING",
    "VITE_ENABLE_AQVORA_STAGING_INVOICE_LIFECYCLE", "VITE_ENABLE_AQVORA_VERIFIED_AR_READS"]) vi.stubEnv(name, "false");
  const org = randomUUID(), user = randomUUID(), invoice = randomUUID();
  const legacy: QueuedTransaction = {id: randomUUID(), idempotencyKey: randomUUID(), organizationId: org,
    createdBy: user, accountId: randomUUID(), type: "income", amountPaisa: 777, categoryId: null,
    businessDate: "2026-11-20", deviceEntryTime: "2026-11-20T00:00:00Z", rawText: "Legacy queued income",
    createdByName: "Synthetic OWNER", status: "queued", attempts: 2, createdAt: 1};
  await enqueueOfflineTransaction(legacy);
  try {
    const pending = await import("../src/accounting/pendingSalesIssue");
    const original = pending.reserveSalesIssue(org, user, invoice, "3", "a".repeat(64));
    const before = await getOfflineQueue();
    const network = vi.spyOn(globalThis, "fetch");
    const {issueIsolatedSalesInvoice} = await import("../src/services/aqvoraSalesLifecycleService");
    const {postIsolatedCustomerReceipt} = await import("../src/services/aqvoraReceiptPostingService");
    const context = {organizationId: org, userId: user, isCloudAccount: true, currency: "PKR", asOfDate: "2026-11-20"};
    const args = {p_organization_id: org, p_expected_revision: "3", p_fingerprint: original.fingerprint, p_intent_key: original.intentKey};
    await expect(issueIsolatedSalesInvoice(context, {...args, p_invoice_id: invoice})).rejects.toThrow(/disabled/i);
    await expect(postIsolatedCustomerReceipt(context, {...args, p_receipt_id: randomUUID()})).rejects.toThrow(/disabled/i);
    expect(network).not.toHaveBeenCalled();
    expect(await getOfflineQueue()).toEqual(before);
    const bundle = await createLocalRecoveryBundle(org, before, [], null);
    const save = vi.fn(enqueueOfflineTransaction);
    const dependencies = {getQueue: getOfflineQueue, getDrafts: async () => [], saveQueueItem: save, saveDraft: vi.fn()};
    expect(await restoreLocalRecoveryBundle(bundle, org, dependencies)).toEqual({queuedTransactions: 0, offlineDrafts: 0});
    expect(save).not.toHaveBeenCalled();
    expect(pending.loadPendingSalesIssue(org, user)).toEqual(original);
    vi.resetModules();
    expect((await import("../src/accounting/pendingSalesIssue")).loadPendingSalesIssue(org, user)).toEqual(original);
    expect(await getOfflineQueue()).toEqual(before);
  } finally { await dequeueOfflineTransaction(legacy.idempotencyKey); }
});
