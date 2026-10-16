import type { TransactionDraft } from "../types/ledger";
import type { QueuedTransaction } from "./offlineQueue";

export const LOCAL_RECOVERY_FORMAT = "SHOP_PRO_LOCAL_RECOVERY_BUNDLE_V1";

export interface LocalRecoveryBundle {
  format: typeof LOCAL_RECOVERY_FORMAT;
  organizationId: string;
  exportedAt: string;
  scope: string[];
  excluded: string[];
  indexedDb: {
    queuedTransactions: QueuedTransaction[];
    offlineDrafts: TransactionDraft[];
  };
  sqliteBackup: unknown;
  integrity: { algorithm: "SHA-256"; digest: string };
}

export interface LocalRecoveryRestoreDependencies {
  getQueue: () => Promise<QueuedTransaction[]>;
  getDrafts: (organizationId: string) => Promise<TransactionDraft[]>;
  saveQueueItem: (transaction: QueuedTransaction) => Promise<void>;
  saveDraft: (draft: TransactionDraft) => Promise<void>;
  restoreSqliteBackup?: (backup: unknown) => Promise<void>;
}

async function sha256(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createLocalRecoveryBundle(
  organizationId: string,
  queue: QueuedTransaction[],
  drafts: TransactionDraft[],
  sqliteBackup: unknown,
  sqliteBackupUnavailable = false,
  exportedAt = new Date().toISOString(),
): Promise<LocalRecoveryBundle> {
  const queuedTransactions = queue.filter(
    (transaction) => transaction.organizationId === organizationId,
  );
  const unscopedQueueCount = queue.filter(
    (transaction) => !transaction.organizationId,
  ).length;
  const payload = {
    format: LOCAL_RECOVERY_FORMAT,
    organizationId,
    exportedAt,
    scope: [
      "IndexedDB pending transactions explicitly scoped to this shop",
      "IndexedDB offline drafts scoped to this shop",
      ...(sqliteBackup
        ? ["Validated local SQLite business data and its synchronization queue"]
        : []),
    ],
    excluded: [
      "Cloud-synchronized records: use the scheduled private cloud backup for those",
      "Authentication credentials and secrets",
      ...(unscopedQueueCount
        ? [`${unscopedQueueCount} legacy queued item(s) without a shop ID; omitted to prevent cross-shop export`]
        : []),
      ...(sqliteBackupUnavailable
        ? ["Local SQLite snapshot: the current role is not authorized to export the full device database"]
        : []),
    ],
    indexedDb: {
      queuedTransactions,
      offlineDrafts: drafts.filter(
        (draft) => draft.organization_id === organizationId,
      ),
    },
    sqliteBackup,
  };

  return {
    ...payload,
    format: LOCAL_RECOVERY_FORMAT,
    integrity: { algorithm: "SHA-256", digest: await sha256(payload) },
  };
}

export async function validateLocalRecoveryBundle(
  value: unknown,
  organizationId: string,
): Promise<LocalRecoveryBundle> {
  if (
    !value ||
    typeof value !== "object" ||
    !("format" in value) ||
    value.format !== LOCAL_RECOVERY_FORMAT ||
    !("organizationId" in value) ||
    value.organizationId !== organizationId ||
    !("exportedAt" in value) ||
    typeof value.exportedAt !== "string" ||
    !("scope" in value) ||
    !Array.isArray(value.scope) ||
    !("excluded" in value) ||
    !Array.isArray(value.excluded) ||
    !("indexedDb" in value) ||
    !value.indexedDb ||
    typeof value.indexedDb !== "object" ||
    !("queuedTransactions" in value.indexedDb) ||
    !Array.isArray(value.indexedDb.queuedTransactions) ||
    !("offlineDrafts" in value.indexedDb) ||
    !Array.isArray(value.indexedDb.offlineDrafts) ||
    !("sqliteBackup" in value) ||
    !("integrity" in value) ||
    !value.integrity ||
    typeof value.integrity !== "object" ||
    !("algorithm" in value.integrity) ||
    value.integrity.algorithm !== "SHA-256" ||
    !("digest" in value.integrity) ||
    typeof value.integrity.digest !== "string"
  ) {
    throw new Error("Invalid local recovery bundle or organization.");
  }

  const bundle = value as LocalRecoveryBundle;
  if (
    bundle.indexedDb.queuedTransactions.some(
      (transaction) =>
        !transaction ||
        typeof transaction !== "object" ||
        transaction.organizationId !== organizationId,
    ) ||
    bundle.indexedDb.offlineDrafts.some(
      (draft) =>
        !draft || typeof draft !== "object" || draft.organization_id !== organizationId,
    )
  ) {
    throw new Error("Local recovery bundle contains data from another shop.");
  }

  const { integrity: _integrity, ...payload } = bundle;
  if (await sha256(payload) !== bundle.integrity.digest) {
    throw new Error("Local recovery bundle checksum verification failed.");
  }
  return bundle;
}

export async function restoreLocalRecoveryBundle(
  value: unknown,
  organizationId: string,
  dependencies: LocalRecoveryRestoreDependencies,
): Promise<{ queuedTransactions: number; offlineDrafts: number }> {
  const bundle = await validateLocalRecoveryBundle(value, organizationId);
  const [currentQueue, currentDrafts] = await Promise.all([
    dependencies.getQueue(),
    dependencies.getDrafts(organizationId),
  ]);
  const queueByKey = new Map(
    currentQueue.map((transaction) => [transaction.idempotencyKey, transaction]),
  );
  const draftsById = new Map(currentDrafts.map((draft) => [draft.id, draft]));
  const queueToSave: QueuedTransaction[] = [];
  const draftsToSave: TransactionDraft[] = [];
  const archiveQueueKeys = new Set<string>();
  const archiveDraftIds = new Set<string>();

  for (const transaction of bundle.indexedDb.queuedTransactions) {
    if (
      !transaction ||
      transaction.organizationId !== organizationId ||
      typeof transaction.idempotencyKey !== "string" ||
      !transaction.idempotencyKey
    ) {
      throw new Error("Local recovery bundle contains an invalid queued transaction.");
    }
    if (archiveQueueKeys.has(transaction.idempotencyKey)) {
      throw new Error("Local recovery bundle contains duplicate queued transaction keys.");
    }
    archiveQueueKeys.add(transaction.idempotencyKey);
    const existing = queueByKey.get(transaction.idempotencyKey);
    if (existing && JSON.stringify(existing) !== JSON.stringify(transaction)) {
      throw new Error("A queued transaction key conflicts with existing local work.");
    }
    if (!existing) queueToSave.push(transaction);
  }

  for (const draft of bundle.indexedDb.offlineDrafts) {
    if (
      !draft ||
      draft.organization_id !== organizationId ||
      typeof draft.id !== "string" ||
      !draft.id
    ) {
      throw new Error("Local recovery bundle contains an invalid offline draft.");
    }
    if (archiveDraftIds.has(draft.id)) {
      throw new Error("Local recovery bundle contains duplicate draft IDs.");
    }
    archiveDraftIds.add(draft.id);
    const existing = draftsById.get(draft.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(draft)) {
      throw new Error("A draft ID conflicts with existing local work.");
    }
    if (!existing) draftsToSave.push(draft);
  }

  if (bundle.sqliteBackup !== null) {
    if (!dependencies.restoreSqliteBackup) {
      throw new Error("This device or user is not authorized to restore the SQLite backup.");
    }
    await dependencies.restoreSqliteBackup(bundle.sqliteBackup);
  }

  for (const transaction of queueToSave) {
    await dependencies.saveQueueItem(transaction);
  }
  for (const draft of draftsToSave) {
    await dependencies.saveDraft(draft);
  }

  return {
    queuedTransactions: queueToSave.length,
    offlineDrafts: draftsToSave.length,
  };
}
