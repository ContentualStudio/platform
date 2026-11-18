"use client";

import { ChevronsUpDown, LogOut, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/admin/admin-format";
import type { AdminIdentity } from "@/lib/admin/admin-session";
import { signOutAdmin } from "@/lib/admin/admin-auth-client";

export function AdminUserMenu({ admin }: { admin: AdminIdentity }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);

    try {
      await signOutAdmin();
    } finally {
      // Leave either way: a failed call most likely means the session was
      // already gone, and the gate re-checks on arrival regardless.
      router.replace("/admin/sign-in");
      router.refresh();
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-3 rounded-full py-1 pr-3 pl-1 text-left transition-colors hover:bg-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-control"
          type="button"
        >
          <AdminAvatar admin={admin} />
          <span className="hidden min-w-0 flex-col sm:flex">
            <span className="truncate text-sm font-semibold text-foreground">
              {admin.name}
            </span>
            <span className="truncate text-xs text-muted-foreground">{admin.email}</span>
          </span>
          <ChevronsUpDown className="hidden size-4 text-muted-foreground sm:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-md p-1" sideOffset={8}>
        <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2 font-normal">
          <AdminAvatar admin={admin} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-foreground">
              {admin.name}
            </span>
            <span className="truncate text-xs text-muted-foreground">{admin.email}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
          <ShieldCheck className="size-4 text-success" />
          Internal team access
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 px-2 py-2 text-sm"
          disabled={signingOut}
          onSelect={(event) => {
            event.preventDefault();
            void handleSignOut();
          }}
          variant="destructive"
        >
          <LogOut className="size-4" />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AdminAvatar({ admin }: { admin: AdminIdentity }) {
  return (
    <Avatar className="size-8">
      {admin.image ? <AvatarImage alt="" src={admin.image} /> : null}
      <AvatarFallback className="bg-accent-soft text-xs font-bold text-accent-text">
        {initials(admin.name)}
      </AvatarFallback>
    </Avatar>
  );
}
