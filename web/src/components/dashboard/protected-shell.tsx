import { Suspense } from "react";
import { MobileAppNav } from "@/components/dashboard/mobile-app-nav";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { SidebarSkeleton } from "@/components/dashboard/shell-skeletons";
import { cn } from "@/lib/utils";

/**
 * Static chrome for every protected route. Nothing here reads request data, so
 * the whole frame prerenders into the route's shell and shows up instantly on
 * navigation. The sidebar is Suspense-wrapped because it reads `usePathname`,
 * which suspends while prerendering routes with unknown dynamic params
 * (`/settings/[section]`).
 */
export function ProtectedShell({
  children,
  header,
  noPadding = false,
}: {
  children: React.ReactNode;
  header?: React.ReactNode;
  /** Drops the shell's default p-10 for routes with their own full-bleed layout. */
  noPadding?: boolean;
}) {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Suspense fallback={<SidebarSkeleton />}>
        <DashboardSidebar />
      </Suspense>
      <div
        className={cn(
          "flex-1 overflow-y-auto",
          !noPadding &&
            "p-6 pb-24 max-[920px]:px-6 max-[920px]:py-8 min-[921px]:p-10 min-[921px]:pb-10",
        )}
      >
        {header}
        {children}
      </div>
      <Suspense fallback={null}>
        <MobileAppNav />
      </Suspense>
    </div>
  );
}
