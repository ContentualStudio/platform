"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";

export interface ToastMessage {
  id: number;
  title: string;
  description?: string;
}

const TOAST_DURATION = 3500;

/** Single-slot toast: a new message replaces whatever is showing. */
export function usePlanningToast() {
  const [toast, setToast] = React.useState<ToastMessage | null>(null);

  const showToast = React.useCallback((title: string, description?: string) => {
    setToast({ description, id: Date.now(), title });
  }, []);

  const dismissToast = React.useCallback(() => setToast(null), []);

  React.useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = setTimeout(() => setToast(null), TOAST_DURATION);

    return () => clearTimeout(timer);
  }, [toast]);

  return { dismissToast, showToast, toast };
}

export function PlanningToast({
  onDismiss,
  toast,
}: {
  onDismiss: () => void;
  toast: ToastMessage | null;
}) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !toast) {
    return null;
  }

  return createPortal(
    <div
      aria-live="polite"
      className="fixed right-4 top-16 z-200 flex w-auto max-w-[380px] animate-[planning-slide-up_200ms_var(--ease-contentual)] items-start gap-3 rounded-4xl bg-surface-raised px-4.5 py-3.5 shadow-menu"
      role="status"
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-3xl bg-accent-soft text-accent"
      >
        <Sparkles className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-sm font-semibold text-foreground">
          {toast.title}
        </p>
        {toast.description ? (
          <p className="text-sm leading-body text-muted">
            {toast.description}
          </p>
        ) : null}
      </div>
      <button
        aria-label="Dismiss notification"
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-200 ease-contentual hover:bg-control"
        onClick={onDismiss}
        type="button"
      >
        <X className="size-4" />
      </button>
    </div>,
    document.body,
  );
}
