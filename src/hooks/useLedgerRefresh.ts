import { useEffect, useRef } from "react";
import { ledgerService, OFFLINE_SYNC_COMPLETE_EVENT } from "../services/ledgerService";
/** Coalesce realtime, reconnect and foreground signals without resetting the active filters. */
export function useLedgerRefresh(refresh: () => Promise<unknown>, scope?: string) {
  const callback = useRef(refresh); callback.current = refresh;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false, pending = false, active = true;
    const run = async () => {
      if (!active) return;
      if (running) { pending = true; return; }
      running = true;
      try { await callback.current(); } catch { /* page owns its visible error state */ }
      finally { running = false; if (pending && active) { pending = false; void run(); } }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void run(); }, 120); };
    const foreground = () => { if (document.visibilityState === "visible") schedule(); };
    const stop = ledgerService.subscribeToLiveTransactions(schedule);
    window.addEventListener("online", schedule);
    window.addEventListener(OFFLINE_SYNC_COMPLETE_EVENT, schedule);
    document.addEventListener("visibilitychange", foreground);
    return () => { active = false; clearTimeout(timer); stop(); window.removeEventListener("online", schedule); window.removeEventListener(OFFLINE_SYNC_COMPLETE_EVENT, schedule); document.removeEventListener("visibilitychange", foreground); };
  }, [scope]);
}
