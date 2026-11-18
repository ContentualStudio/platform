import { Suspense } from "react";
import { AdminGate } from "@/components/admin/admin-gate";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { RetryBoundary } from "@/components/error/retry-boundary";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * The one shell every admin section renders inside, so the gate and the
 * navigation are defined once.
 *
 * Nothing here awaits: the sidebar and top bar frame are the prerendered
 * shell, the gate and the signed-in identity stream in behind Suspense, and
 * each page owns its own boundary — so a failing section shows its retry
 * inside the panel while the navigation keeps working.
 */
export default function AdminConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <SidebarProvider>
        <RetryBoundary
          description="We couldn't confirm your admin session."
          title="Admin unavailable"
        >
          <Suspense fallback={null}>
            <AdminGate />
          </Suspense>
        </RetryBoundary>

        <AdminSidebar />

        <SidebarInset className="bg-admin-panel md:rounded-lg md:border md:border-border md:shadow-soft">
          <AdminTopbar />
          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 md:px-8">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
