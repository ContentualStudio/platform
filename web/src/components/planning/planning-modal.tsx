"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useModalDialog } from "@/hooks/use-modal-dialog";
import { cn } from "@/lib/utils";

interface PlanningModalProps {
  children: React.ReactNode;
  className?: string;
  /** Accessible name; rendered by the caller as the dialog's heading. */
  labelledBy: string;
  onClose: () => void;
}

/**
 * Overlay + dialog shell shared by the idea editor, the delete confirm, and the
 * output preview. Closes on a backdrop click; the rest of the dialog behaviour
 * (Escape, scroll lock, focus) is useModalDialog.
 */
export function PlanningModal({
  children,
  className,
  labelledBy,
  onClose,
}: PlanningModalProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  useModalDialog(dialogRef, onClose, mounted);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex animate-[planning-fade-in_150ms_var(--ease-contentual)] items-center justify-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={cn(
          "flex w-[480px] max-w-full animate-[planning-slide-up_200ms_var(--ease-contentual)] flex-col gap-4 rounded-lg border border-border bg-background p-6 shadow-menu outline-none",
          className,
        )}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
