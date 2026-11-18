"use client";

import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeAdminAction } from "@/actions/admin-team";
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

const buttonClassName =
  "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";

/** A quiet "Remove" that confirms in a modal, naming the person, before signing them out. */
export function RemoveAdminButton({ id, name, email }: { id: string; name: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function remove() {
    setError("");

    startTransition(async () => {
      const result = await removeAdminAction({ id });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError("");
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <button
          className="h-8 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-control hover:text-destructive"
          type="button"
        >
          Remove
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {name}?</DialogTitle>
          <DialogDescription>
            {email} will lose access to the admin and be signed out straight away. You can add
            them again later.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <button
              className={`${buttonClassName} text-muted-foreground hover:text-foreground`}
              disabled={pending}
              type="button"
            >
              Cancel
            </button>
          </DialogClose>
          <button
            className={`${buttonClassName} bg-destructive text-destructive-foreground hover:opacity-90`}
            disabled={pending}
            onClick={remove}
            type="button"
          >
            {pending ? "Removing…" : "Remove access"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
