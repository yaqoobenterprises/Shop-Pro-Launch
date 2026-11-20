import { useEffect, useRef, useState } from "react";
import type { SalesCustomer } from "../../accounting/salesContracts";
import type { InvoiceOpenBalance, ReceivablesReconciliation } from "../../accounting/receiptContracts";
import { useAuth } from "../../context/AuthContext";
import { loadIsolatedSalesCustomers } from "../../services/aqvoraSalesCustomersReadService";
import {
  collectIsolatedOpenInvoices, loadIsolatedReceivablesReconciliation,
} from "../../services/aqvoraReceivablesReadService";
import {
  isIsolatedReceivablesReadEnabled, type IsolatedReceivablesContext,
} from "../../services/aqvoraReceivablesStagingGate";
import { ReceivablesReportPanel } from "./ReceivablesReportPanel";
import { InvoiceEvidencePanel } from "./InvoiceEvidencePanel";
import { ReceiptEvidencePanel } from "./ReceiptEvidencePanel";

interface DisplayedReport {
  contextKey: string;
  report: ReceivablesReconciliation;
  invoices: InvoiceOpenBalance[] | null;
}

function companyToday(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const find = (type: string) => parts.find(p => p.type === type)?.value ?? "";
    return `${find("year")}-${find("month")}-${find("day")}`;
  } catch { return ""; }
}

export function ReceivablesWorkspace() {
  const { organization, user, isCloudAccount, isDemoMode } = useAuth();
  const [date, setDate] = useState(() => companyToday(organization.timezone));
  const [customerId, setCustomerId] = useState("");
  const [customers, setCustomers] = useState<SalesCustomer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState("");
  const [report, setReport] = useState<DisplayedReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [receiptId, setReceiptId] = useState("");
  const [receiptInput, setReceiptInput] = useState("");
  const reportGeneration = useRef(0);
  const customerGeneration = useRef(0);

  const enabled = isIsolatedReceivablesReadEnabled();
  const canRead = enabled && !isDemoMode && isCloudAccount && Boolean(user?.id) &&
    (user?.role === "OWNER" || user?.role === "MANAGER");
  const userId = user?.id ?? "";
  const contextKey = [organization.id, userId, organization.currency, date, customerId].join("|");
  const shown = report?.contextKey === contextKey ? report : null;

  useEffect(() => {
    const generation = ++customerGeneration.current;
    let active = true;
    ++reportGeneration.current;
    setCustomers([]);
    setCustomerId("");
    setReport(null);
    setInvoiceId("");
    setReceiptId("");
    setCustomersError("");
    setDate(companyToday(organization.timezone));
    if (!canRead || !userId) return () => { active = false; };
    setCustomersLoading(true);
    const context: IsolatedReceivablesContext = {
      organizationId: organization.id, userId,
      currency: organization.currency, asOfDate: companyToday(organization.timezone),
      isCloudAccount,
    };
    void loadIsolatedSalesCustomers(context).then(result => {
      if (active && customerGeneration.current === generation) setCustomers(result.customers);
    }).catch(reason => {
      if (active && customerGeneration.current === generation) {
        setCustomersError(reason instanceof Error ? reason.message : "Customer list unavailable.");
      }
    }).finally(() => {
      if (active && customerGeneration.current === generation) setCustomersLoading(false);
    });
    return () => { active = false; };
  }, [canRead, organization.id, organization.currency, organization.timezone, userId, isCloudAccount]);

  const invalidate = () => {
    ++reportGeneration.current;
    setReport(null);
    setInvoiceId("");
    setReceiptId("");
    setReportError("");
  };

  const loadReport = async () => {
    if (!canRead || !user || !date) return;
    const generation = ++reportGeneration.current;
    setReport(null);
    setInvoiceId("");
    setReceiptId("");
    setReportError("");
    setReportLoading(true);
    const key = contextKey;
    const context: IsolatedReceivablesContext = {
      organizationId: organization.id, userId: user.id, currency: organization.currency,
      customerId: customerId || undefined, asOfDate: date, isCloudAccount,
    };
    try {
      const [reconciliation, open] = await Promise.all([
        loadIsolatedReceivablesReconciliation(context),
        customerId
          ? collectIsolatedOpenInvoices({ ...context, customerId })
          : Promise.resolve(null),
      ]);
      if (open) {
        const total = open.invoices.reduce((sum, item) => sum + BigInt(item.outstanding_minor), 0n);
        if (open.source.snapshot_token !== reconciliation.source.snapshot_token ||
            open.source.authorized_user_id !== reconciliation.source.authorized_user_id ||
            total.toString() !== reconciliation.outstanding_minor) {
          throw new Error("AR report and open invoices came from different or unbalanced sources.");
        }
      }
      if (generation === reportGeneration.current) {
        setReport({contextKey: key, report: reconciliation, invoices: open?.invoices ?? null});
      }
    } catch (reason) {
      if (generation === reportGeneration.current) {
        setReportError(reason instanceof Error ? reason.message : "Financial report unavailable.");
      }
    } finally {
      if (generation === reportGeneration.current) setReportLoading(false);
    }
  };

  if (!canRead) return (
    <div className="page-content space-y-3 p-5">
      <h1 className="text-xl font-semibold">AQVORA Receivables</h1>
      <p role="status" className="text-sm text-text-muted">
        Verified V2 finance is unavailable. This workspace is default-off and requires
        a separately approved isolated staging project and authorized cloud OWNER/MANAGER.
        Existing Shop Pro accounts and demo data are not connected.
      </p>
    </div>
  );

  const context: IsolatedReceivablesContext = {
    organizationId: organization.id, userId: user?.id ?? "",
    currency: organization.currency, asOfDate: date,
    customerId: customerId || undefined, isCloudAccount,
  };
  return (
    <div className="page-content space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <span className="text-xs font-bold tracking-wider text-primary">VERIFIED V2 · STAGING ONLY</span>
        <h1 className="text-2xl font-semibold text-on-surface">Accounts receivable</h1>
        <p className="text-sm text-text-muted">Real source-backed service invoices and controlled-cash receipts. No legacy balances or bank clearing.</p>
      </header>
      <form aria-label="Receivables filters" onSubmit={event => {
        event.preventDefault(); void loadReport();
      }} className="flex flex-wrap items-end gap-3 rounded-xl border border-border-standard bg-surface-bright p-4">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          Customer
          <select aria-label="Customer" value={customerId} onChange={event => {
            invalidate(); setCustomerId(event.target.value);
          }} className="min-h-11 rounded-md border border-border-standard bg-surface-bright px-3">
            <option value="">All customers · company totals</option>
            {customers.filter(c => c.is_active).map(c => (
              <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Business-date cutoff
          <input aria-label="Business-date cutoff" type="date" required value={date}
            onChange={event => { invalidate(); setDate(event.target.value); }}
            className="min-h-11 rounded-md border border-border-standard bg-surface-bright px-3" />
        </label>
        <button type="submit" disabled={reportLoading || customersLoading || Boolean(customersError)}
          className="min-h-11 rounded-lg bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50">
          {reportLoading ? "Verifying…" : "Load verified AR"}
        </button>
      </form>
      {customersLoading && <p role="status">Loading company customer directory…</p>}
      {customersError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{customersError}</p>}
      {reportError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{reportError}</p>}
      {shown && <ReceivablesReportPanel currency={organization.currency}
        report={shown.report} invoices={shown.invoices} onInspectInvoice={setInvoiceId} />}
      {invoiceId && shown && <InvoiceEvidencePanel key={invoiceId} invoiceId={invoiceId}
        context={context} onClose={() => setInvoiceId("")} onReceipt={setReceiptId} />}
      <section aria-label="Receipt lookup" className="rounded-xl border border-border-standard bg-surface-bright p-4">
        <h2 className="mb-2 font-semibold">Inspect a posted receipt</h2>
        <form className="flex flex-wrap gap-2" onSubmit={event => {
          event.preventDefault(); setReceiptId(receiptInput.trim());
        }}>
          <label className="min-w-48 flex-1 text-sm">Receipt UUID
            <input aria-label="Receipt UUID" value={receiptInput} required
              onChange={event => setReceiptInput(event.target.value)}
              placeholder="Paste a posted receipt ID"
              className="mt-1 min-h-11 w-full rounded-md border border-border-standard bg-surface-bright px-3" />
          </label>
          <button type="submit" className="self-end rounded-lg border border-border-standard px-4 py-3">
            Inspect receipt
          </button>
        </form>
      </section>
      {receiptId && <ReceiptEvidencePanel key={receiptId} receiptId={receiptId}
        context={context} onClose={() => setReceiptId("")} />}
    </div>
  );
}
