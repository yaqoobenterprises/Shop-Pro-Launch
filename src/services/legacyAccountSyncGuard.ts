/**
 * Legacy account sync payloads contain balance snapshots, not journal entries.
 * Never replay them through generic cloud UPSERTs until reconciliation is approved.
 */
export function requiresAccountBalanceReconciliation(
  tableName: string,
  operation: string,
  payload: Record<string, unknown>,
): boolean {
  return tableName === 'payment_accounts' &&
    (operation === 'INSERT' || operation === 'UPDATE') &&
    (Object.prototype.hasOwnProperty.call(payload, 'current_balance') ||
      Object.prototype.hasOwnProperty.call(payload, 'opening_balance'));
}
