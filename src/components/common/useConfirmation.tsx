import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertDialog } from "radix-ui";
import { Button } from "./Button";
interface Question { title: string; description: string; action?: string }
/** A single, accessible destructive confirmation replaces browser-native prompts. */
export function useConfirmation() {
  const [question, setQuestion] = useState<Question | null>(null);
  const resolver = useRef<((answer: boolean) => void) | null>(null);
  const settle = useCallback((answer: boolean) => { resolver.current?.(answer); resolver.current = null; setQuestion(null); }, []);
  const confirm = useCallback((next: Question) => {
    if (resolver.current) return Promise.resolve(false);
    setQuestion(next);
    return new Promise<boolean>(resolve => { resolver.current = resolve; });
  }, []);
  useEffect(() => () => { resolver.current?.(false); resolver.current = null; }, []);
  const confirmationDialog = <AlertDialog.Root open={Boolean(question)} onOpenChange={open => { if (!open) settle(false); }}><AlertDialog.Portal><AlertDialog.Overlay className="fixed inset-0 z-[70] bg-[var(--sp-overlay)]" /><AlertDialog.Content className="sp-confirm-dialog fixed start-1/2 top-1/2 z-[71] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-popover p-6 text-popover-foreground shadow-lg"><AlertDialog.Title className="text-lg font-semibold">{question?.title}</AlertDialog.Title><AlertDialog.Description className="mt-2 text-sm text-muted-foreground">{question?.description}</AlertDialog.Description><div className="mt-6 flex justify-end gap-2"><AlertDialog.Cancel asChild><Button variant="outline" onClick={() => settle(false)}>Cancel</Button></AlertDialog.Cancel><AlertDialog.Action asChild><Button variant="danger" onClick={() => settle(true)}>{question?.action || "Confirm"}</Button></AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>;
  return { confirm, confirmationDialog };
}
