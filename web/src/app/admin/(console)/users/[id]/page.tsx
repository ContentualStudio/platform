import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  AdminUserBadges,
  AdminUserHeader,
  AdminUserHeaderSkeleton,
  AdminUserPlatform,
  AdminUserProgrammes,
  AdminUserProgress,
} from "@/components/admin/users/admin-user-detail";
import { AdminUserSupport } from "@/components/admin/users/admin-user-support";
import { PanelBoundary } from "@/components/admin/panel";
import { RetryBoundary } from "@/components/error/retry-boundary";
import { userBackLink } from "@/lib/admin/admin-users-search";

export const metadata: Metadata = { title: "User" };

/**
 * One account's operational state. Every panel reads its own endpoint inside
 * its own boundary, so one failing data source shows an inline retry while
 * the others still render. Support actions is the page's only write.
 */
export default function AdminUserPage({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  return (
    <>
      <Suspense fallback={<BackLink href="/admin/users" label="Users" />}>
        <BackToUsers searchParams={searchParams} />
      </Suspense>

      <RetryBoundary description="We couldn't load this user." title="User unavailable">
        <Suspense fallback={<AdminUserHeaderSkeleton />}>
          <AdminUserHeader params={params} />
        </Suspense>
      </RetryBoundary>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <PanelBoundary rows={4} title="Programmes">
            <AdminUserProgrammes params={params} />
          </PanelBoundary>
          <PanelBoundary title="Badges">
            <AdminUserBadges params={params} />
          </PanelBoundary>
        </div>
        <div className="flex flex-col gap-6">
          <PanelBoundary rows={2} title="Streak & level">
            <AdminUserProgress params={params} />
          </PanelBoundary>
          <PanelBoundary rows={4} title="Instagram">
            <AdminUserPlatform params={params} />
          </PanelBoundary>
          <PanelBoundary rows={4} title="Support actions">
            <AdminUserSupport params={params} />
          </PanelBoundary>
        </div>
      </div>
    </>
  );
}

async function BackToUsers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <BackLink {...userBackLink((await searchParams).from)} />;
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      href={href}
    >
      <ArrowLeft className="size-4" />
      {label}
    </Link>
  );
}
