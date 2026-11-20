import { useEffect, useState } from "react";
import { formatExactCurrencyMinor } from "../../accounting/formatExactCurrencyMinor";
import {
  loadIsolatedCustomerReceipt, type VerifiedReceiptDetails,
} from "../../services/aqvoraCashReceiptReadService";
import type { IsolatedReceivablesContext } from "../../services/aqvoraReceivablesStagingGate";

interface Props {
  receiptId: string;
  context: IsolatedReceivablesContext;
  onClose: () => void;
}

export function ReceiptEvidencePanel({receiptId, context, onClose}: Props) {
  const [result, setResult] = useState<VerifiedReceiptDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { organizationId, userId, customerId, currency, asOfDate, isCloudAccount } = context;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setResult(null);
    setError("");
    void loadIsolatedCustomerReceipt({
      organizationId, userId, customerId, currency, asOfDate, isCloudAccount,
    }, receiptId).then(value => {
      if (alive) setResult(value);
    }).catch(reason => {
      if (alive) setError(reason instanceof Error ? reason.message : "Receipt could not be verified.");
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [receiptId, organizationId, userId, customerId, currency, asOfDate, isCloudAccount]);

  const fmt = (minor: string) => formatExactCurrencyMinor(minor, currency);
  return (
    <section aria-label="Cash receipt financial evidence"
      className="rounded-xl border border-border-standard bg-surface-bright p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-on-surface">Customer receipt evidence</h2>
        <button type="button" onClick={onClose}
          className="rounded-md border border-border-standard px-3 py-2 text-sm">
          Close receipt
        </button>
      </div>
      <p className="mb-3 break-all font-mono text-xs text-text-muted">{receiptId}</p>
      {loading && <p role="status">Checking posted journal and original cash claim…</p>}
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {result && (
        <div className="space-y-3 text-sm">
          <p className="font-semibold text-on-surface">
            {result.receipt.receipt_number} · {fmt(result.receipt.amount_minor)}
          </p>
          <p>Receipt status: {result.receipt.state}. Cash evidence:
            {" "}{result.cash.attestation === "dual_control" ? "Two-person manually attested" : "Not confirmed"}.
          </p>
          <p className="text-xs text-text-muted">
            Bank verification: unavailable. This receipt does not prove a cleared bank deposit.
          </p>
          {result.receipt.state === "posted" && result.receipt.reconciliation && (
            <div className="rounded-lg bg-surface-container-low p-3">
              <p>Cash debit: {fmt(result.receipt.reconciliation.cash_debit_minor)}</p>
              <p>Accounts receivable credit: {fmt(result.receipt.reconciliation.ar_credit_minor)}</p>
              <p>Allocated: {fmt(result.receipt.reconciliation.allocated_minor)}</p>
              <p className="mt-2 break-all text-xs text-text-muted">
                Journal: {result.receipt.journal_id}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
