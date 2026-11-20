import { getSupabaseClient } from '../lib/supabase';
import type { QueuedTransaction } from './offlineQueue';

/** Insert-only replay. Corrections and voids belong to explicit user commands. */
export async function confirmOfflineTransaction(
  item: QueuedTransaction,
  principal: { id: string; organizationId: string },
  categoryId: string | null,
): Promise<void> {
  if (!item.organizationId || !item.createdBy || !item.accountId) {
    throw new Error('Queued transaction is missing its original shop, creator, or account and requires review.');
  }
  if (item.organizationId !== principal.organizationId || item.createdBy !== principal.id) {
    throw new Error('Queued transaction belongs to a different shop or creator.');
  }
  if (!item.id || !item.idempotencyKey || !Number.isSafeInteger(item.amountPaisa) || item.amountPaisa <= 0) {
    throw new Error('Queued transaction has an invalid identity or amount and requires review.');
  }
  const payload = {
    id: item.id,
    organization_id: item.organizationId,
    account_id: item.accountId,
    type: item.type,
    amount_paisa: item.amountPaisa,
    category_id: categoryId,
    adjustment_dir: item.adjustmentDir || null,
    business_date: item.businessDate,
    device_entry_time: item.deviceEntryTime,
    note: item.note || null,
    raw_text: item.rawText,
    status: 'active',
    idempotency_key: item.idempotencyKey,
    created_by: item.createdBy,
    created_by_name: item.createdByName,
  };
  const client = getSupabaseClient();
  const inserted = await client.from('transactions')
    .upsert(payload, { onConflict: 'idempotency_key', ignoreDuplicates: true })
    .select().maybeSingle();
  if (inserted.error) throw inserted.error;

  let receipt = inserted.data;
  if (!receipt) {
    const existing = await client.from('transactions').select()
      .eq('organization_id', item.organizationId)
      .eq('idempotency_key', item.idempotencyKey).maybeSingle();
    if (existing.error) throw existing.error;
    receipt = existing.data;
  }
  // Verify both insert and retry responses. A successful HTTP request with no
  // visible receipt is not an acknowledgement. Keep changed entries for review.
  const fields = ['id', 'organization_id', 'account_id', 'type', 'category_id',
    'adjustment_dir', 'business_date', 'note', 'raw_text', 'idempotency_key', 'created_by'] as const;
  if (!receipt || fields.some((field) => receipt[field] !== payload[field]) ||
      String(receipt.amount_paisa) !== String(item.amountPaisa) ||
      Date.parse(receipt.device_entry_time) !== Date.parse(item.deviceEntryTime) ||
      !['active', 'voided'].includes(receipt.status)) {
    throw new Error('Posting receipt is missing or differs from the queued entry. Keep it for review; do not overwrite the ledger.');
  }
  // A matching voided receipt confirms the original posting. Never restore it.
}
