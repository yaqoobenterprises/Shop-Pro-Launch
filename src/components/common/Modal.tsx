import React from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";
import { cn } from "../../lib/utils";

export interface ModalProps {
  isOpen: boolean;
  isBusy?: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
}
const widths = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-xl", "2xl": "max-w-2xl", "3xl": "max-w-3xl", "4xl": "max-w-4xl" };
/** Radix handles focus containment, nested portals, Escape and focus restoration. */
export const Modal: React.FC<ModalProps> = ({ isOpen, isBusy = false, onClose, title, description, children, maxWidth = "lg" }) => (
  <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isBusy) onClose(); }}>
    <DialogContent hideClose={isBusy} onEscapeKeyDown={event => { if (isBusy) { event.preventDefault(); event.stopPropagation(); } }} onInteractOutside={event => { if (isBusy) event.preventDefault(); }} className={cn("sp-dialog w-[calc(100%-2rem)] gap-0 p-0", widths[maxWidth])}>
      <header className="sp-dialog-heading">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className={description ? "mt-1 text-sm" : "sr-only"}>{description || `${title} form and actions`}</DialogDescription>
      </header>
      <div className="sp-dialog-body">{children}</div>
    </DialogContent>
  </Dialog>
);
