import { useEffect, useState } from "react";
import type { InvoiceOpenBalance } from "../../accounting/receiptContracts";
import {formatCertifiedSourceMoney} from "../../accounting/sourceMoneyEvidence";
import { loadIsolatedInvoiceOpenBalance } from "../../services/aqvoraReceivablesReadService";
import type { IsolatedReceivablesContext } from "../../services/aqvoraReceivablesStagingGate";

interface Props {
  invoiceId: string;
  context: IsolatedReceivablesContext;
  onClose: () => void;
  onReceipt: (receiptId: string) => void;
}

export function InvoiceEvidencePanel({ invoiceId, context, onClose, onReceipt }: Props) {
  const [invoice, setInvoice] = useState<InvoiceOpenBalance | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const { organizationId, userId, customerId, currency, asOfDate, isCloudAccount } = context;
  useEffect(() => {
    let alive = true;
    setInvoice(null);
    setError("");
    setLoading(true);
    void loadIsolatedInvoiceOpenBalance({
      organizationId, userId, customerId, currency, asOfDate, isCloudAccount,
    }, invoiceId).then(value => {
      if (alive) setInvoice(value);
    }).catch(reason => {
      if (alive) setError(reason instanceof Error ? reason.message : "Invoice could not be verified.");
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [invoiceId, organizationId, userId, customerId, currency, asOfDate, isCloudAccount]);

  const fmt=(minor:string)=>invoice
    ?formatCertifiedSourceMoney(minor,invoice):`${currency} raw minor units unavailable`;
  return (
    <section aria-label="Invoice financial evidence"
      className="rounded-xl border border-border-standard bg-surface-bright p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-on-surface">Invoice verification</h2>
        <button type="button" onClick={onClose}
          className="rounded-md border border-border-standard px-3 py-2 text-sm">
          Close invoice
        </button>
      </div>
      <p className="mb-3 break-all font-mono text-xs text-text-muted">{invoiceId}</p>
      {loading && <p role="status">Verifying invoice source…</p>}
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {invoice && (
        <div className="space-y-3 text-sm">
          <p className="font-semibold text-on-surface">
            {invoice.status === "settled" ? "Settled by controlled-cash receipts"
              : invoice.status === "partial" ? "Partially allocated" : "No posted receipt allocation"}
          </p>
          <p>Invoiced: {fmt(invoice.face_minor)} · Allocated: {fmt(invoice.allocated_minor)}
            {" · "}Remaining: {fmt(invoice.outstanding_minor)}</p>
          <p role="status" className="text-xs text-text-muted">
            {invoice.currency_policy && invoice.display_complete!==false
              ? `Original invoice currency scale certified · exponent ${invoice.currency_policy.currency_exponent} · revision ${invoice.currency_policy.revision}`
              : "Original invoice currency scale unavailable · exact raw minor units shown"}
          </p>
          <p className="text-xs text-text-muted">
            Source verified for V2 at {asOfDate}; this is not bank-statement clearance.
            Later backdated postings can change historical business-date balances.
          </p>
          <div className="space-y-2">
            <h3 className="font-semibold">Posted receipt allocations</h3>
            {invoice.allocations.length === 0 && <p>No posted allocations at this cutoff.</p>}
            {invoice.allocations.map(item => (
              <div key={item.allocation_id}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-border-standard pt-2">
                <div>
                  <p className="font-semibold">{item.receipt_number} · {fmt(item.amount_minor)}</p>
                  <p className="text-xs text-text-muted">{item.business_date}</p>
                </div>
                <button type="button" onClick={() => onReceipt(item.receipt_id)}
                  className="rounded-md border border-border-standard px-3 py-2 text-primary">
                  Inspect receipt
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
