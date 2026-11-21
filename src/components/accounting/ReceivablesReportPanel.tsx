import type { ReceivablesReconciliation, InvoiceOpenBalance } from "../../accounting/receiptContracts";
import {formatCertifiedReportMoney,validateReportCurrencyEvidence}
  from "../../accounting/currencyReportEvidence";
import {formatCertifiedSourceMoney,requireMatchingInvoicePolicyForReport}
  from "../../accounting/sourceMoneyEvidence";

interface Props {
  currency: string;
  report: ReceivablesReconciliation;
  invoices: InvoiceOpenBalance[] | null;
  onInspectInvoice: (invoiceId: string) => void;
}

export function ReceivablesReportPanel({
  currency, report, invoices, onInspectInvoice,
}: Props) {
  const scope={organizationId:report.source.organization_id,currency,
    asOfDate:report.as_of_date};
  const evidence=validateReportCurrencyEvidence(report.source,scope);
  const fmt=(minor:string)=>formatCertifiedReportMoney(minor,currency,evidence);
  const invoiceFmt=(minor:string,invoice:InvoiceOpenBalance)=>{
    requireMatchingInvoicePolicyForReport(invoice,evidence);
    return formatCertifiedSourceMoney(minor,invoice);
  };
  return (
    <section aria-label="Verified V2 receivables" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {title:"Invoiced",amount:report.face_minor},
          {title:"Allocated cash",amount:report.allocated_minor},
          {title:"Outstanding AR",amount:report.outstanding_minor},
        ].map(item=>(
          <article key={item.title} className="rounded-xl border border-border-standard bg-surface-bright p-4">
            <p className="text-xs font-semibold text-text-muted">{item.title}</p>
            <p className="mt-2 text-xl font-semibold text-on-surface">{fmt(item.amount)}</p>
          </article>
        ))}
      </div>
      <p role="status" className="rounded-lg border border-border-standard p-3 text-xs text-text-muted">
        Certified V2 journal scope only. Legacy opening balances excluded. Cash receipts are
        manually dual-attested, not bank-verified; AR aging is unavailable.
        Source cutoff: {report.as_of_date}. Reconciliation to AR control: {fmt(report.ar_control_minor)}.
      </p>
      <p role="status" className="rounded-lg border border-border-standard p-3 text-xs text-text-muted">
        {evidence?.display_complete===true&&evidence.currency_policy
          ? <>Company-certified currency unit scale · {currency} · exponent {evidence.currency_policy.currency_exponent}
            {" · "}revision {evidence.currency_policy.revision}. Dates and monetary
            values retain their immutable source authority.</>
          : <>Currency policy unconfigured or historical. Exact raw minor units only;
            no assumed decimal places or bank clearing.</>}
      </p>
      {invoices === null ? (
        <div className="rounded-xl border border-border-standard bg-surface-bright p-4 text-sm text-text-muted">
          Select a customer and load the report to inspect individual open invoices.
          Company totals above are reconciled, but no complete company invoice listing is available here.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-standard bg-surface-bright">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="px-4 py-3 text-left font-semibold text-on-surface">
              Open service invoices · {invoices.length} certified V2 rows
            </caption>
            <thead className="border-y border-border-standard bg-surface-container-low text-xs text-text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">Invoice ID</th>
                <th scope="col" className="px-4 py-3">Due</th>
                <th scope="col" className="px-4 py-3">Invoiced</th>
                <th scope="col" className="px-4 py-3">Allocated</th>
                <th scope="col" className="px-4 py-3">Outstanding</th>
                <th scope="col" className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(invoice=>(
                <tr key={invoice.invoice_id} className="border-b border-border-standard">
                  <td className="px-4 py-3 font-mono text-xs text-on-surface">
                    {invoice.invoice_id.slice(0,8)}…
                  </td>
                  <td className="px-4 py-3">{invoice.due_date}</td>
                  <td className="px-4 py-3">{invoiceFmt(invoice.face_minor,invoice)}</td>
                  <td className="px-4 py-3">{invoiceFmt(invoice.allocated_minor,invoice)}</td>
                  <td className="px-4 py-3 font-semibold">{invoiceFmt(invoice.outstanding_minor,invoice)}</td>
                  <td className="px-4 py-3">
                    <button type="button"
                      className="rounded-md border border-border-standard px-3 py-2 text-primary hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary"
                      onClick={()=>onInspectInvoice(invoice.invoice_id)}>
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
              {invoices.length===0&&(
                <tr><td colSpan={6} className="px-4 py-5 text-sm text-text-muted">
                  No outstanding V2 invoices for this customer at the selected cutoff.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
