import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Transaction } from "../../types/ledger";
import { formatPaisa } from "../../lib/money";
import { formatKarachiTime } from "../../lib/dates";
import { useI18n } from "../../i18n";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { useSubmissionGuard } from "../../hooks/useSubmissionGuard";
interface VoidModalProps { transaction: Transaction | null; onConfirmVoid: (id: string, reason: string, currentUpdatedAt: string) => Promise<void>; onClose: () => void }
export const VoidModal: React.FC<VoidModalProps> = ({ transaction, onConfirmVoid, onClose }) => {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmissionGuard();
  if (!transaction) return null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) { setError("A void reason is required by shop policy."); return; }
    await run(async () => {
      setError(null);
      try { await onConfirmVoid(transaction.id, reason.trim(), transaction.updated_at); onClose(); }
      catch (err) { setError(err instanceof Error ? err.message : "Failed to void transaction. Check if it was modified concurrently."); }
    });
  };
  return <Modal isOpen isBusy={busy} onClose={() => { if (!busy) onClose(); }} title={t("chat.voidTransaction")} description="Review this entry before voiding. A reason is required." maxWidth="md">
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-md border border-border bg-muted p-4"><span className="text-sm text-muted-foreground">{t("chat.transactionToVoid")}</span><strong className="mt-1 block font-semibold">{transaction.category_name || transaction.type.toUpperCase()} · {formatPaisa(transaction.amount_paisa, { showPaisaIfFraction: true })}</strong><p className="mt-1 text-xs text-muted-foreground">Entered: {formatKarachiTime(transaction.device_entry_time)} by {transaction.created_by_name}</p></div>
      <Input label="Reason for voiding" required autoFocus value={reason} disabled={busy} onChange={e => setReason(e.target.value)} placeholder="e.g. Incorrect amount" error={error || undefined} />
      <div className="flex justify-end gap-2"><Button variant="outline" type="button" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="danger" type="submit" isLoading={busy} disabled={!reason.trim()}><Trash2 size={16} />Confirm Void</Button></div>
    </form>
  </Modal>;
};
