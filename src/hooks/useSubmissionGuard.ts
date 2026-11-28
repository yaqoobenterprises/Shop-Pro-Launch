import { useCallback, useRef, useState } from "react";
/** The ref closes the gap before React paints a disabled button. */
export function useSubmissionGuard() {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (operation: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try { await operation(); } finally { pending.current = false; setBusy(false); }
  }, []);
  return { busy, run };
}
