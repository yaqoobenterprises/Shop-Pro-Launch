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
    <div className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[var(--layer-toast)] flex flex-col gap-2 pointer-events-none md:inset-x-auto md:end-5 md:bottom-5 md:w-full md:max-w-sm">
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
            role={toast.type === "error" ? "alert" : "status"}
            className={cn(
              "toast-note pointer-events-auto flex items-start gap-3 rounded-[var(--radius-control)] border p-3 shadow-level-2",
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
              type="button"
              aria-label="Dismiss notification"
              onClick={() => removeToast(toast.id)}
              className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-container-low hover:text-on-surface transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
