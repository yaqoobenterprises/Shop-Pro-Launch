import React, { useEffect, useState } from 'react';
import { RotateCcw, CheckCircle2 } from 'lucide-react';
import { formatPaisa } from '../../lib/money';
import { useI18n } from '../../i18n';

interface UndoToastProps {
  transactionId: string;
  categoryName: string;
  amountPaisa: number;
  onUndo: (id: string) => void;
  onDismiss: () => void;
  durationMs?: number;
}

export const UndoToast: React.FC<UndoToastProps> = ({
  transactionId,
  categoryName,
  amountPaisa,
  onUndo,
  onDismiss,
  durationMs = 6000,
}) => {
  const { t } = useI18n();
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remainingPct = Math.max(0, 100 - (elapsed / durationMs) * 100);
      setProgress(remainingPct);

      if (elapsed >= durationMs) {
        clearInterval(interval);
        onDismiss();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [durationMs, onDismiss]);

  return (
    <div className="fixed bottom-20 left-1/2 z-50 w-[90%] max-w-md -translate-x-1/2 animate-in overflow-hidden rounded-xl border border-border-standard bg-surface-bright text-on-surface shadow-level-3 fade-in slide-in-from-bottom-4 duration-200">
      <div className="p-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
          <div className="truncate text-sm">
            <span className="font-semibold">{categoryName}</span>{" "}
            <span className="font-mono font-bold text-on-surface">
              {formatPaisa(amountPaisa)}
            </span>{" "}
            <span className="text-xs opacity-75">{t('chat.saved')}</span>
          </div>
        </div>

        <button
          onClick={() => onUndo(transactionId)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border-standard bg-surface-container-high px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-highest"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {t('common.undo')}
        </button>
      </div>

      {/* Progress Bar (6-second countdown) */}
      <div className="h-1 w-full bg-surface-container">
        <div
          className="h-full bg-success transition-all duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
