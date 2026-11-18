import { Flame, SearchX, UsersRound } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { EmptyState, emptyStateActionClassName } from "@/components/admin/empty-state";
import { TierBadge } from "@/components/admin/users/tier-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDay,
  formatLastActive,
  initials,
  pageTokens,
} from "@/lib/admin/admin-format";
import {
  adminUserAvatarUrl,
  getAdminUsers,
  type AdminUserListRow,
} from "@/lib/admin/admin-users";
import {
  adminUsersHref,
  parseAdminUsersSearch,
} from "@/lib/admin/admin-users-search";

const headClassName =
  "h-10 px-4 text-2xs font-semibold uppercase tracking-wide text-muted-foreground";

export async function AdminUsersResults({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = parseAdminUsersSearch(await searchParams);
  const result = await getAdminUsers(search);
  // Relative "last active" needs the request's clock, which only exists once
  // the render is request-bound.
  await connection();
  const now = new Date();

  if (result.total === 0) {
    return search.q ? <NoMatches query={search.q} /> : <NoUsers />;
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  if (result.users.length === 0) {
    return <PastLastPage lastPage={totalPages} query={search.q} />;
  }

  const from = adminUsersHref(search);
  const first = (result.page - 1) * result.pageSize + 1;
  const last = first + result.users.length - 1;

  return (
    <>
      <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={headClassName}>User</TableHead>
              <TableHead className={headClassName}>Tier</TableHead>
              <TableHead className={headClassName}>Current programme</TableHead>
              <TableHead className={`${headClassName} text-right`}>Streak</TableHead>
              <TableHead className={headClassName}>Last active</TableHead>
              <TableHead className={headClassName}>Signed up</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.users.map((user) => (
              <AdminUserRow
                from={from}
                key={user.id}
                now={now}
                user={user}
              />
            ))}
          </TableBody>
      </Table>

      <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
        <p className="text-sm text-muted-foreground tabular-nums">
          Showing <span className="font-semibold text-foreground">{first}–{last}</span> of{" "}
          <span className="font-semibold text-foreground">{result.total.toLocaleString("en-GB")}</span>{" "}
          {result.total === 1 ? "user" : "users"}
        </p>
        {totalPages > 1 ? (
          <AdminUsersPagination page={result.page} query={search.q} totalPages={totalPages} />
        ) : null}
      </div>
    </>
  );
}

function AdminUserRow({
  user,
  now,
  from,
}: {
  user: AdminUserListRow;
  now: Date;
  /** The list URL this row sits on, so the user view can link back to it. */
  from: string;
}) {
  const avatarUrl = adminUserAvatarUrl(user);

  return (
    // The name's link is stretched over the row (after:inset-0), so the whole
    // row opens the user while staying one real, focusable link.
    <TableRow className="relative focus-within:bg-control">
      <TableCell className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-9">
            {avatarUrl ? <AvatarImage alt="" src={avatarUrl} /> : null}
            <AvatarFallback className="bg-control text-xs font-bold text-foreground">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2">
              <Link
                className="truncate font-semibold text-foreground outline-none after:absolute after:inset-0 focus-visible:underline"
                href={`/admin/users/${encodeURIComponent(user.id)}?from=${encodeURIComponent(from)}`}
              >
                {user.name || "Unnamed user"}
              </Link>
              {user.isFoundingCreator ? (
                <Badge className="relative" variant="accent">
                  Founding
                </Badge>
              ) : null}
            </span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
        </div>
      </TableCell>

      <TableCell className="px-4 py-3">
        <TierBadge tier={user.tier} />
      </TableCell>

      <TableCell className="max-w-64 px-4 py-3">
        {user.currentProgramme ? (
          user.currentProgramme.title ? (
            <span className="block truncate text-foreground">{user.currentProgramme.title}</span>
          ) : (
            <span className="flex flex-col">
              <span className="truncate font-mono text-xs text-foreground">
                {user.currentProgramme.slug}
              </span>
              <span className="text-xs text-muted-foreground">Not in published content</span>
            </span>
          )
        ) : (
          <span className="text-muted-foreground">None</span>
        )}
      </TableCell>

      <TableCell className="px-4 py-3 text-right tabular-nums">
        {user.currentStreak > 0 ? (
          <span className="inline-flex items-center gap-1 font-semibold text-foreground">
            <Flame aria-hidden className="size-4 text-accent-text" />
            {user.currentStreak}
            <span className="sr-only">{user.currentStreak === 1 ? "day" : "days"}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </TableCell>

      <TableCell className="px-4 py-3 text-muted-foreground">
        {user.lastActive ? (
          <time dateTime={user.lastActive.at} title={formatDay(user.lastActive.at)}>
            {formatLastActive(user.lastActive, now)}
          </time>
        ) : (
          <span className="text-muted-foreground">Never</span>
        )}
      </TableCell>

      <TableCell className="px-4 py-3 text-muted-foreground tabular-nums">
        <time dateTime={user.signedUpAt}>{formatDay(user.signedUpAt)}</time>
      </TableCell>
    </TableRow>
  );
}

function AdminUsersPagination({
  page,
  totalPages,
  query,
}: {
  page: number;
  totalPages: number;
  query: string;
}) {
  return (
    <Pagination className="mx-0 w-auto">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            aria-disabled={page <= 1}
            href={adminUsersHref({ q: query, page: Math.max(1, page - 1) })}
            scroll={false}
            tabIndex={page <= 1 ? -1 : undefined}
          />
        </PaginationItem>
        {pageTokens(page, totalPages).map((token) =>
          typeof token === "number" ? (
            <PaginationItem key={token}>
              <PaginationLink
                href={adminUsersHref({ q: query, page: token })}
                isActive={token === page}
                scroll={false}
              >
                {token}
              </PaginationLink>
            </PaginationItem>
          ) : (
            <PaginationItem key={token}>
              <PaginationEllipsis />
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationNext
            aria-disabled={page >= totalPages}
            href={adminUsersHref({ q: query, page: Math.min(totalPages, page + 1) })}
            scroll={false}
            tabIndex={page >= totalPages ? -1 : undefined}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function NoUsers() {
  return (
    <EmptyState
      description="When creators sign up they'll appear here."
      icon={UsersRound}
      title="No users yet"
    />
  );
}

function NoMatches({ query }: { query: string }) {
  return (
    <EmptyState
      action={
        <Link className={emptyStateActionClassName} href="/admin/users">
          Clear search
        </Link>
      }
      description={
        <>
          Nothing matches <span className="font-semibold text-foreground">“{query}”</span>.
          Try part of a name or email address.
        </>
      }
      icon={SearchX}
      title="No users match"
    />
  );
}

function PastLastPage({ lastPage, query }: { lastPage: number; query: string }) {
  return (
    <EmptyState
      action={
        <Link
          className={emptyStateActionClassName}
          href={adminUsersHref({ q: query, page: lastPage })}
        >
          Go to page {lastPage}
        </Link>
      }
      description="This page is past the end of the list."
      icon={SearchX}
      title="Nothing on this page"
    />
  );
}

export function AdminUsersTableSkeleton() {
  return (
    <div aria-hidden data-skeleton>
      <div>
        <div className="h-10 border-b border-border" />
        {["a", "b", "c", "d", "e", "f", "g", "h"].map((row) => (
          <div
            className="flex h-16 items-center gap-3 border-b border-border px-4 last:border-0"
            key={row}
          >
            <div className="size-9 shrink-0 rounded-full bg-foreground/10" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-3 w-40 rounded-xs bg-foreground/10" />
              <div className="h-3 w-56 rounded-xs bg-foreground/5" />
            </div>
            <div className="hidden h-5 w-14 rounded-full bg-foreground/5 md:block" />
            <div className="hidden h-3 w-32 rounded-xs bg-foreground/5 lg:block" />
          </div>
        ))}
      </div>
      <div className="flex h-14 items-center border-t border-border px-4">
        <div className="h-4 w-40 rounded-xs bg-foreground/5" />
      </div>
    </div>
  );
}
