import React from "react";
import { Dialog, DialogContent, DialogDescription } from "../ui/dialog";
interface Props { children: React.ReactNode; busy: boolean; onCancel: () => void; batch?: boolean }
export function ReviewDialog({ children, busy, onCancel, batch }: Props) {
  return <Dialog open onOpenChange={open => { if (!open && !busy) onCancel(); }}><DialogContent hideClose className={`sp-review-dialog ${batch ? "max-w-3xl" : "max-w-2xl"}`} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}>
    <DialogDescription className="sr-only">Review transaction details and account before posting to your cashbook.</DialogDescription>{children}
  </DialogContent></Dialog>;
}
