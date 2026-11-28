import React, { useEffect, useRef } from "react";
import { Toaster, toast } from "sonner";
import { useApp } from "../../context/AppContext";
import { useTheme } from "../../design-system/useTheme";
/** Preserve the existing notification queue and timeout contract. */
export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();
  const [theme] = useTheme();
  const shown = useRef(new Set<string>());
  useEffect(() => {
    const active = new Set(toasts.map(item => item.id));
    for (const id of shown.current) if (!active.has(id)) { toast.dismiss(id); shown.current.delete(id); }
    for (const item of toasts) if (!shown.current.has(item.id)) {
      shown.current.add(item.id);
      toast[item.type](item.title, { id: item.id, description: item.message, duration: Infinity, onDismiss: () => removeToast(item.id) });
    }
  }, [toasts, removeToast]);
  useEffect(() => { const ids = shown.current; return () => { for (const id of ids) toast.dismiss(id); }; }, []);
  return <Toaster theme={theme} closeButton position="bottom-right" gap={8} toastOptions={{ className: "sp-toast", style: { fontFamily: "var(--sp-font)", background: "var(--sp-surface-raised)", color: "var(--sp-text)", borderColor: "var(--sp-border)" } }} />;
};
