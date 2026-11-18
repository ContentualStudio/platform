import { Suspense } from "react";
import { AdminUserMenu } from "@/components/admin/admin-user-menu";
import { HeaderRetryBoundary } from "@/components/error/header-retry-boundary";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getAdminServer } from "@/lib/admin/admin-session";

export function AdminTopbar() {
  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-admin-panel/90 px-4 backdrop-blur md:rounded-t-lg md:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator className="h-5" orientation="vertical" />
      <span className="text-sm font-medium text-muted-foreground">
        Internal tools
      </span>

      <div className="ml-auto">
        <HeaderRetryBoundary>
          <Suspense fallback={<AdminUserMenuSkeleton />}>
            <AdminTopbarUser />
          </Suspense>
        </HeaderRetryBoundary>
      </div>
    </header>
  );
}

async function AdminTopbarUser() {
  const session = await getAdminServer();

  // Signed out is the gate's to handle (it redirects); render nothing here so
  // the two never race to show different things.
  return session.status === "signed-in" ? (
    <AdminUserMenu admin={session.admin} />
  ) : null;
}

function AdminUserMenuSkeleton() {
  return (
    <div aria-hidden className="flex items-center gap-3 py-1 pr-3 pl-1" data-skeleton>
      <div className="size-8 rounded-full bg-foreground/10" />
      <div className="hidden flex-col gap-1 sm:flex">
        <div className="h-3 w-24 rounded-xs bg-foreground/10" />
        <div className="h-3 w-32 rounded-xs bg-foreground/5" />
      </div>
    </div>
  );
}
