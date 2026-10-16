import React, { useState } from 'react';
import { Transaction } from '../../types/ledger';
import { parseInputToPaisa, formatPaisa } from '../../lib/money';
import { Edit3, AlertCircle, X, Check } from 'lucide-react';
import { useRegion } from '../../regional/region';
import { useI18n } from '../../i18n';

interface EditModalProps {
  transaction: Transaction | null;
  onConfirmEdit: (
    id: string,
    updates: { amount_paisa?: number; note?: string | null },
    currentUpdatedAt: string
  ) => Promise<void>;
  onClose: () => void;
}

export const EditModal: React.FC<EditModalProps> = ({ transaction, onConfirmEdit, onClose }) => {
  const { region } = useRegion();
  const { t } = useI18n();
  const [amountStr, setAmountStr] = useState(
    transaction ? (transaction.amount_paisa / 100).toString() : ''
  );
  const [note, setNote] = useState(transaction?.note || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!transaction) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInputToPaisa(amountStr);
    if (!parsed.isValid || parsed.paisa <= 0) {
      setError(parsed.error || 'Amount must be greater than zero.');
      return;
    }
    const newAmountPaisa = parsed.paisa;

    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirmEdit(
        transaction.id,
        {
          amount_paisa: newAmountPaisa,
          note: note.trim() || null,
        },
        transaction.updated_at
      );
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to edit transaction. It may have been updated concurrently.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="workspace-panel max-w-sm w-full rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-surface-container-low border-b border-border-standard flex items-center justify-between">
          <div className="flex items-center gap-2 text-on-surface">
            <Edit3 className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-base">{t('transaction.edit')}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-on-surface">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="text-xs text-text-muted">
            {t('common.editing', {
              category: transaction.category_name || transaction.type.toUpperCase(),
              date: transaction.business_date,
            })}
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1.5">
              {t('currency.amountLabel', { currency: region.currency })} <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder={t('common.amountExample')}
              className="workspace-control w-full px-3.5 py-2.5 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1.5">
              {t('transaction.noteOptional')}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('transaction.notePlaceholder')}
              className="workspace-control w-full px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {error && (
            <div className="p-2.5 bg-danger-bg border border-danger-border rounded-lg text-danger text-xs flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-medium text-secondary hover:text-on-surface"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-on-primary font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              {isSubmitting ? t('common.saving') : t('common.saveChanges')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
