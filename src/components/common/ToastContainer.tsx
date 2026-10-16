import React from "react";
import { useApp } from "../../context/AppContext";
import {
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
      {toasts.map((toast) => {
        const icons = {
          success: <CheckCircle2 className="h-5 w-5 text-success shrink-0" />,
          error: <AlertCircle className="h-5 w-5 text-danger shrink-0" />,
          warning: (
            <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          ),
          info: <Info className="h-5 w-5 shrink-0 text-primary" />,
        };

        const borders = {
          success: "border-success-border bg-surface-bright text-on-surface",
          error: "border-danger-border bg-surface-bright text-on-surface",
          warning: "border-warning-border bg-surface-bright text-on-surface",
          info: "border-primary/20 bg-surface-bright text-on-surface",
        };

        return (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-level-2 transition-all animate-in slide-in-from-bottom-3",
              borders[toast.type],
            )}
          >
            {icons[toast.type]}
            <div className="flex-1 text-left">
              <h4 className="text-xs font-semibold text-on-surface">
                {toast.title}
              </h4>
              {toast.message && (
                <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
                  {toast.message}
                </p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-text-muted hover:text-on-surface transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
