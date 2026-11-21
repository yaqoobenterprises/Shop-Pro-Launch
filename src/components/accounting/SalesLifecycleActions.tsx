import type { SalesInvoice, SalesTransitionRequest } from "../../accounting/salesContracts";
import { formatExactCurrencyMinor } from "../../accounting/formatExactCurrencyMinor";

interface Props {
  invoice: SalesInvoice;
  actorId: string;
  actorRole: string | undefined;
  issueEnabled: boolean;
  busy: boolean;
  pendingRecovery: boolean;
  reason: string;
  confirmed: boolean;
  onReason: (reason: string) => void;
  onConfirmed: (confirmed: boolean) => void;
  onTransition: (action: SalesTransitionRequest["p_action"]) => void;
  onIssue: () => void;
  onRecover: () => void;
}

export function SalesLifecycleActions(p: Props) {
  const { invoice: v } = p;
  const owner = p.actorRole === "OWNER";
  const maker = v.created_by === p.actorId;
  const canEdit = !p.busy && !p.pendingRecovery;
  const fmt = (minor: string) => formatExactCurrencyMinor(minor, v.currency);
  return (
    <section aria-label="Invoice workflow actions"
      className="space-y-3 rounded-xl border border-border-standard bg-surface-bright p-4">
      <h2 className="text-lg font-semibold">Verified invoice workflow</h2>
      <p className="break-all text-xs font-mono text-text-muted">{v.id}</p>
      <div className="grid gap-2 sm:grid-cols-2 text-sm">
        <p>State: <strong>{v.state}</strong></p>
        <p>Revision: <strong>{v.revision}</strong></p>
        <p>Service invoice face: <strong>{fmt(v.face_minor)}</strong></p>
        <p>Checker: <strong>{v.approved_by ? v.approved_by.slice(0,8)+"…" : "Not approved"}</strong></p>
      </div>
      <p className="text-xs text-text-muted">
        All changes require a live AAL2 session and canonical SQL authorization.
        A trusted out-of-tax-scope service policy is required for submission;
        issuing a journal additionally requires an enrolled isolated company.
      </p>
      {v.state === "draft" && maker && (
        <button type="button" disabled={!canEdit} onClick={() => p.onTransition("submit")}
          className="rounded-lg bg-primary px-4 py-3 text-white disabled:opacity-50">
          Submit for independent approval
        </button>
      )}
      {v.state === "submitted" && owner && !maker && (
        <button type="button" disabled={!canEdit} onClick={() => p.onTransition("approve")}
          className="rounded-lg bg-primary px-4 py-3 text-white disabled:opacity-50">
          Approve (distinct OWNER)
        </button>
      )}
      {v.state !== "issued" && v.state !== "cancelled" && (
        <div className="space-y-2">
          <label className="block text-sm">
            Reason (required for reject/cancel)
            <textarea aria-label="Invoice action reason" maxLength={500}
              disabled={!canEdit} value={p.reason} onChange={e => p.onReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border-standard bg-surface-bright p-3"
              rows={2} />
          </label>
          <div className="flex flex-wrap gap-2">
            {v.state === "submitted" && owner && (
              <button type="button" disabled={!canEdit || !p.reason.trim()}
                onClick={() => p.onTransition("reject")}
                className="rounded-lg border border-border-standard px-4 py-3 disabled:opacity-50">
                Reject to draft
              </button>
            )}
            <button type="button" disabled={!canEdit || !p.reason.trim()}
              onClick={() => p.onTransition("cancel")}
              className="rounded-lg border border-border-standard px-4 py-3 disabled:opacity-50">
              Cancel unissued invoice
            </button>
          </div>
        </div>
      )}
      {v.state === "approved" && (
        <section className="space-y-2 rounded-lg border border-border-standard p-3">
          <h3 className="font-semibold">Issue financial journal</h3>
          {!p.issueEnabled ? (
            <p role="status" className="text-sm text-text-muted">
              Financial issue writer is locked by a separate staging-only release gate.
              No journal can be posted from this screen.
            </p>
          ) : p.pendingRecovery ? (
            <button type="button" disabled={p.busy} onClick={p.onRecover}
              className="rounded-lg bg-primary px-4 py-3 text-white disabled:opacity-50">
              Recover original issue — never create a new intent
            </button>
          ) : (
            <>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={p.confirmed}
                  disabled={p.busy} onChange={e=>p.onConfirmed(e.target.checked)}/>
                I confirm this is the approved service invoice and understand issuance creates an immutable financial journal.
              </label>
              <button type="button" disabled={p.busy || !p.confirmed} onClick={p.onIssue}
                className="rounded-lg bg-primary px-4 py-3 text-white disabled:opacity-50">
                Issue source-backed invoice
              </button>
            </>
          )}
        </section>
      )}
      {v.state === "issued" && (
        <div role="status" className="space-y-2 rounded-lg border border-border-standard p-3 text-sm">
          <p className="font-semibold">{v.document_number} · Issued with verified journal</p>
          <p className="break-all text-xs">Journal ID: {v.journal_id}</p>
          <p>Dr Accounts Receivable: {fmt(v.face_minor)}</p>
          <p>Cr Service Revenue: {fmt(v.face_minor)}</p>
          {v.reconciliation && <>
            <p>Allocated receipts: {fmt(v.reconciliation.allocated_minor)}</p>
            <p>Remaining AR: {fmt(v.reconciliation.outstanding_minor)}</p>
          </>}
          <p className="text-xs text-text-muted">These are V2-only amounts. Historical legacy books and bank clearance are excluded.</p>
        </div>
      )}
    </section>
  );
}
