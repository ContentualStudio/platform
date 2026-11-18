"use client";

import * as React from "react";

const FOCUSABLE =
  "input, select, textarea, button, [href], [tabindex]:not([tabindex='-1'])";

/**
 * The behaviour every modal dialog here shares, while `active` (the dialog is
 * in the DOM): Escape closes it, background scroll is locked, focus
 * moves into the dialog and Tab stays there, and focus returns to whatever
 * opened it on close.
 */
export function useModalDialog(
  dialogRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true,
) {
  // The latest onClose, so the effect below runs once per open, not per render.
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  });

  React.useEffect(() => {
    if (!active) {
      return;
    }

    const opener = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialog)?.focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      const head = focusable[0];
      const tail = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault();
        tail?.focus();
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault();
        head?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [active, dialogRef]);
}
