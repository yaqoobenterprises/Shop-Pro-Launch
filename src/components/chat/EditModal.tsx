import React, { useState } from "react";
import { Check } from "lucide-react";
import type { Transaction } from "../../types/ledger";
import { parseInputToPaisa } from "../../lib/money";
import { useRegion } from "../../regional/region";
import { useI18n } from "../../i18n";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
import { useSubmissionGuard } from "../../hooks/useSubmissionGuard";
interface EditModalProps { transaction: Transaction | null; onConfirmEdit: (id: string, updates: { amount_paisa?: number; note?: string | null }, currentUpdatedAt: string) => Promise<void>; onClose: () => void }
export const EditModal: React.FC<EditModalProps> = ({ transaction, onConfirmEdit, onClose }) => {
  const { region } = useRegion(); const { t } = useI18n();
  const [amount, setAmount] = useState(transaction ? (transaction.amount_paisa / 100).toString() : "");
  const [note, setNote] = useState(transaction?.note || "");
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmissionGuard();
  if (!transaction) return null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseInputToPaisa(amount);
    if (!parsed.isValid || parsed.paisa <= 0) { setError(parsed.error || "Amount must be greater than zero."); return; }
    await run(async () => {
      setError(null);
      try { await onConfirmEdit(transaction.id, { amount_paisa: parsed.paisa, note: note.trim() || null }, transaction.updated_at); onClose(); }
      catch (err) { setError(err instanceof Error ? err.message : "Failed to edit transaction. It may have been updated concurrently."); }
    });
  };
  return <Modal isOpen isBusy={busy} onClose={() => { if (!busy) onClose(); }} title={t("transaction.edit")} description={t("common.editing", { category: transaction.category_name || transaction.type.toUpperCase(), date: transaction.business_date })} maxWidth="md">
    <form onSubmit={submit} className="space-y-5">
      <Input label={t("currency.amountLabel", { currency: region.currency })} required autoFocus inputMode="decimal" value={amount} disabled={busy} onChange={e => setAmount(e.target.value)} placeholder={t("common.amountExample")} error={error || undefined} />
      <Input label={t("transaction.noteOptional")} value={note} disabled={busy} onChange={e => setNote(e.target.value)} placeholder={t("transaction.notePlaceholder")} />
      <div className="flex justify-end gap-2"><Button variant="outline" type="button" disabled={busy} onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" isLoading={busy}><Check size={16} />{t("common.saveChanges")}</Button></div>
    </form>
  </Modal>;
};
