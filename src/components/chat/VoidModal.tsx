import React, { useState } from 'react';
import { Transaction } from '../../types/ledger';
import { formatPaisa } from '../../lib/money';
import { formatKarachiTime } from '../../lib/dates';
import { useI18n } from '../../i18n';
import { Trash2, AlertCircle, X } from 'lucide-react';

interface VoidModalProps {
  transaction: Transaction | null;
  onConfirmVoid: (id: string, reason: string, currentUpdatedAt: string) => Promise<void>;
  onClose: () => void;
}

export const VoidModal: React.FC<VoidModalProps> = ({ transaction, onConfirmVoid, onClose }) => {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!transaction) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('A void reason is required by shop policy.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirmVoid(transaction.id, reason.trim(), transaction.updated_at);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to void transaction. Check if it was modified concurrently.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="workspace-panel max-w-sm w-full rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-danger-bg border-b border-danger-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-danger">
            <Trash2 className="w-5 h-5" />
            <h3 className="font-semibold text-base">{t('chat.voidTransaction')}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-on-surface">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="p-3 bg-surface-container-low rounded-xl border border-border-standard">
            <div className="text-xs text-text-muted">{t('chat.transactionToVoid')}</div>
            <div className="font-semibold text-on-surface mt-0.5">
              {transaction.category_name || transaction.type.toUpperCase()}{' '}
              <span className="font-mono text-success">{formatPaisa(transaction.amount_paisa)}</span>
            </div>
            <div className="text-[11px] text-text-muted mt-1 font-mono">
              Entered: {formatKarachiTime(transaction.device_entry_time)} by {transaction.created_by_name}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1.5">
              Reason for Voiding <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Typo in amount, customer cancelled, test"
              className="workspace-control w-full px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-danger/20 focus:border-danger"
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !reason.trim()}
              className="px-4 py-2 bg-danger hover:bg-danger/90 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isSubmitting ? 'Voiding...' : 'Confirm Void'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
