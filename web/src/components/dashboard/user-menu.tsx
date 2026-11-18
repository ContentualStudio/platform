"use client";

import * as React from "react";
import { LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/dashboard/user-avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { signOut } from "@/services/auth.service";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "../ui/button";

export function UserMenu({
  image,
  name,
}: {
  image?: string | null;
  name: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = React.useState(false);

  async function handleLogout() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await signOut();
    } finally {
      setOpen(false);
      useAuthStore.getState().reset();
      router.replace("/auth/sign");
      router.refresh();
    }
  }

  return (
    <>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <button
            aria-label={`Open ${name}'s profile menu`}
            className="rounded-full transition-transform duration-150 ease-contentual hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            type="button"
          >
            <UserAvatar image={image} name={name} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[200px] overflow-hidden rounded-lg bg-popover p-0 shadow-[0_8px_32px_rgb(0_0_0/0.12)] motion-safe:data-[state=open]:animate-[auth-fade-slide-in_150ms_ease] border"
          sideOffset={8}
        >
          <Link
            className="flex w-full items-center gap-2.5 px-4 pb-3 pt-3.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.04] focus-visible:outline-none"
            href="/settings/profile"
            onClick={() => setOpen(false)}
          >
            <UserRound className="size-4 opacity-50" />
            Profile
          </Link>
          <button
            className="flex w-full items-center gap-2.5 px-4 pb-3.5 pt-3 text-left text-sm font-medium text-destructive transition-colors hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.04] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSigningOut}
            onClick={() => {
              setIsLogoutOpen(true);
              setOpen(false);
            }}
            type="button"
          >
            <LogOut className="size-4 opacity-60" />
            {isSigningOut ? "Logging out…" : "Logout"}
          </button>
        </PopoverContent>
      </Popover>

      {isLogoutOpen ? (
        <div
          aria-labelledby="logout-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4"
          role="dialog"
        >
          <div className="w-full max-w-[360px] rounded-4xl bg-popover p-6 text-popover-foreground shadow-menu">
            <h2
              className="text-xl font-extrabold tracking-tight text-foreground"
              id="logout-title"
            >
              Sign out?
            </h2>
            <p className="mt-2 text-base leading-6 text-muted-foreground">
              You will need to sign in again to access your dashboard.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                disabled={isSigningOut}
                onClick={() => setIsLogoutOpen(false)}
                size="sm"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={isSigningOut}
                onClick={() => void handleLogout()}
                size="sm"
                type="button"
              >
                {isSigningOut ? "Signing out" : "Sign out"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
