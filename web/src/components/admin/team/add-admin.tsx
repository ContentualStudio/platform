"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { inviteAdminAction } from "@/actions/admin-team";
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
import { Input } from "@/components/ui/input";

type Notice = { tone: "success" | "warning"; text: string } | null;

const buttonClassName =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";
const primaryClassName = `${buttonClassName} bg-foreground text-background hover:opacity-90`;

/**
 * The Admins card's header: its title, and "Add admin", which opens a modal.
 * The modal is the confirmation step — it states what access the person
 * gets and nothing is sent until "Send invite" — so there is no second
 * "are you sure" screen. Refusals (already an admin, a bad address) stay in
 * the modal; the outcome of a sent invite shows on the page once it closes.
 */
export function AdminTeamHeader({ title }: { title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);

    if (next) {
      // Fresh form every time it opens (state survives navigation otherwise).
      setEmail("");
      setName("");
      setError("");
      setNotice(null);
    }
  }

  function invite(event: FormEvent) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      const result = await inviteAdminAction({
        email: email.trim(),
        ...(name.trim() ? { name: name.trim() } : {}),
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      if (result.data.status === "already_admin") {
        setError(`${result.data.email} is already an admin.`);
        return;
      }

      setNotice(
        result.data.emailSent
          ? { tone: "success", text: `Invited ${result.data.email}.` }
          : {
              tone: "warning",
              text: `Added ${result.data.email}, but the invite email didn't send. Ask them to sign in at /admin/sign-in.`,
            },
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="border-b border-border">
      <div className="flex h-14 items-center justify-between gap-4 px-5">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>

        <Dialog onOpenChange={onOpenChange} open={open}>
          <DialogTrigger asChild>
            <button className={primaryClassName} type="button">
              <Plus className="size-4" />
              Add admin
            </button>
          </DialogTrigger>
          <DialogContent>
            <form className="flex flex-col gap-5" onSubmit={invite}>
              <DialogHeader>
                <DialogTitle>Add an admin</DialogTitle>
                <DialogDescription>
                  They&apos;ll be able to see every creator&apos;s data, and we&apos;ll email them a
                  link to sign in.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-foreground">Email</span>
                  <Input
                    autoComplete="off"
                    autoFocus
                    className="h-10 rounded-md text-sm"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@contentual.com"
                    required
                    type="email"
                    value={email}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-foreground">
                    Name <span className="font-normal text-muted-foreground">(optional)</span>
                  </span>
                  <Input
                    autoComplete="off"
                    className="h-10 rounded-md text-sm"
                    maxLength={80}
                    onChange={(event) => setName(event.target.value)}
                    value={name}
                  />
                </label>
                {error ? (
                  <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
                    <AlertCircle className="size-4 shrink-0" />
                    {error}
                  </p>
                ) : null}
              </div>

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
                <button className={primaryClassName} disabled={pending || !email.trim()} type="submit">
                  {pending ? "Sending…" : "Send invite"}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {notice ? (
        <p
          className="flex items-start gap-2 px-5 pb-4 text-sm text-foreground"
          role={notice.tone === "success" ? "status" : "alert"}
        >
          {notice.tone === "success" ? (
            <CheckCircle2 className="size-4 shrink-0 text-success" />
          ) : (
            <AlertTriangle className="size-4 shrink-0 text-tint-amber" />
          )}
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}
