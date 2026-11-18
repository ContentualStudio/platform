"use client";

import { AlertCircle, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { applySupportAction } from "@/actions/admin-support";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { SupportActionKey } from "@/schemas/admin-support.schema";

const buttonClassName =
  "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";

/**
 * One support action's control: opens a modal that says exactly what will
 * change and asks for a reason, and only then applies it. An api refusal stays
 * in the modal for a retry; the api never applies the same action twice, so a
 * retry after an error is safe.
 */
export function SupportActionButton({
  userId,
  action,
  label,
  title,
  description,
  disabled,
}: {
  userId: string;
  action: SupportActionKey;
  label: string;
  title: string;
  description: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);

    if (next) {
      // State survives navigation, so every opening starts clean.
      setReason("");
      setError("");
      setNotice("");
    }
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");

    startTransition(async () => {
      const result = await applySupportAction({ userId, action, reason: reason.trim() });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      if (result.data.status === "unchanged") {
        // Someone else got there first; nothing was changed or logged.
        setNotice(`Nothing to change: ${result.data.reason}`);
        router.refresh();
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger asChild>
        <button
          className={`${buttonClassName} shrink-0 border border-border text-foreground hover:bg-control`}
          disabled={disabled}
          type="button"
        >
          {label}
        </button>
      </DialogTrigger>
      <DialogContent>
        <form className="flex flex-col gap-5" onSubmit={apply}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Reason</span>
            <textarea
              autoFocus
              className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/15"
              maxLength={500}
              minLength={3}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why this is needed. Saved to the audit log."
              required
              value={reason}
            />
          </label>

          {error ? (
            <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Info className="size-4 shrink-0" />
              {notice}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <button
                className={`${buttonClassName} text-muted-foreground hover:text-foreground`}
                disabled={pending}
                type="button"
              >
                {notice ? "Close" : "Cancel"}
              </button>
            </DialogClose>
            {notice ? null : (
              <button
                className={`${buttonClassName} bg-foreground text-background hover:opacity-90`}
                disabled={pending || reason.trim().length < 3}
                type="submit"
              >
                {pending ? "Applying…" : error ? "Try again" : "Confirm"}
              </button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
