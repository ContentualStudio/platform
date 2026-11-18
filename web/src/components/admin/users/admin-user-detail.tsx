import { AtSign, Award, Flame, NotebookPen, Wrench } from "lucide-react";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { EmptyLine, Panel } from "@/components/admin/panel";
import { ProgressBar } from "@/components/admin/progress-bar";
import { SUPPORT_PANEL_ID } from "@/components/admin/users/admin-user-support";
import { TierBadge } from "@/components/admin/users/tier-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDay, formatLastActive, initials } from "@/lib/admin/admin-format";
import {
  getAdminUser,
  getAdminUserBadges,
  getAdminUserPlatform,
  getAdminUserProgrammes,
  getAdminUserProgress,
  type AdminUserInstagram,
} from "@/lib/admin/admin-user-detail";
import { adminUserAvatarUrl } from "@/lib/admin/admin-users";
import type { ProgrammeHistoryEntry } from "@/schemas/programme-history.schema";
import { cn } from "@/lib/utils";

type IdParams = Promise<{ id: string }>;

/* ------------------------------------------------------------------ header */

export async function AdminUserHeader({ params }: { params: IdParams }) {
  const { id } = await params;
  const user = await getAdminUser(id);
  // "Last active" is relative to the request's clock.
  await connection();
  const now = new Date();
  const avatarUrl = adminUserAvatarUrl(user);

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <Avatar className="size-16">
          {avatarUrl ? <AvatarImage alt="" src={avatarUrl} /> : null}
          <AvatarFallback className="bg-control text-lg font-bold text-foreground">
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-3xl font-bold tracking-tight text-foreground">
              {user.name || "Unnamed user"}
            </h1>
            <TierBadge tier={user.tier} />
            {user.isFoundingCreator ? <Badge variant="accent">Founding</Badge> : null}
          </div>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          <p className="text-sm text-muted-foreground">
            Signed up {formatDay(user.signedUpAt)} · Last active{" "}
            {user.lastActive ? formatLastActive(user.lastActive, now).toLowerCase() : "never"}
          </p>
        </div>
      </div>

      {/* Coaching notes lives in its own ticket; shown so the team knows
          where it goes. Support actions jumps to its panel below. */}
      <div className="flex shrink-0 gap-2">
        <SoonAction icon={NotebookPen} label="Coaching notes" />
        <a
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-control"
          href={`#${SUPPORT_PANEL_ID}`}
        >
          <Wrench className="size-4" />
          Support actions
        </a>
      </div>
    </div>
  );
}

function SoonAction({ icon: Icon, label }: { icon: typeof Award; label: string }) {
  return (
    <button
      aria-disabled
      className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground"
      disabled
      title={`${label} — coming soon`}
      type="button"
    >
      <Icon className="size-4" />
      {label}
      <span className="rounded-full bg-control px-1.5 text-2xs font-semibold">Soon</span>
    </button>
  );
}

export function AdminUserHeaderSkeleton() {
  return (
    <div aria-hidden className="flex items-center gap-4" data-skeleton>
      <div className="size-16 rounded-full bg-foreground/10" />
      <div className="flex flex-col gap-2">
        <div className="h-7 w-56 rounded-xs bg-foreground/10" />
        <div className="h-4 w-72 rounded-xs bg-foreground/5" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ panels */

/* Programme history ------------------------------------------------------- */

export async function AdminUserProgrammes({ params }: { params: IdParams }) {
  const { id } = await params;
  const { inProgress, past } = await getAdminUserProgrammes(id);
  const [current] = inProgress;

  return (
    <Panel title="Programmes">
      {!current && past.length === 0 ? (
        <EmptyLine>This creator hasn&apos;t started a programme yet.</EmptyLine>
      ) : (
        <div className="flex flex-col gap-5">
          {current ? (
            <div className="rounded-md bg-accent-soft px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
                Current programme
              </p>
              <p className="mt-1 text-lg font-bold text-foreground">{programmeName(current)}</p>
              <p className="mb-3 text-sm text-muted-foreground">
                {current.completedDays} of {current.durationDays} days done · started{" "}
                {formatDay(current.startedAt)}
              </p>
              <ProgressBar label="Completion" value={current.completionPercent} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not on a programme right now.</p>
          )}

          {past.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</h3>
              <ul className="divide-y divide-border">
                {past.map((entry) => (
                  <li
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                    key={entry.enrolmentId}
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold text-foreground">
                        <span className="truncate">{programmeName(entry)}</span>
                        <Badge variant={entry.status === "completed" ? "secondary" : "outline"}>
                          {entry.status === "completed" ? "Finished" : "Left"}
                        </Badge>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDay(entry.startedAt)}
                        {entry.endedAt ? ` – ${formatDay(entry.endedAt)}` : ""}
                      </p>
                    </div>
                    <div className="sm:w-56">
                      <ProgressBar label="Completion" value={entry.completionPercent} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function programmeName(entry: ProgrammeHistoryEntry) {
  return entry.title ?? `${entry.slug} (no longer published)`;
}

/* Streak & level ---------------------------------------------------------- */

export async function AdminUserProgress({ params }: { params: IdParams }) {
  const { id } = await params;
  const progress = await getAdminUserProgress(id);

  return (
    <Panel title="Streak & level">
      <dl className="grid grid-cols-3 gap-4">
        <Stat
          icon={
            progress.currentStreak > 0 ? (
              <Flame aria-hidden className="size-4 text-accent-text" />
            ) : undefined
          }
          label="Current streak"
          value={days(progress.currentStreak)}
        />
        <Stat label="Longest streak" value={days(progress.longestStreak)} />
        <Stat label="Level" value={progress.level} />
      </dl>
    </Panel>
  );
}

function days(value: number) {
  return `${value} ${value === 1 ? "day" : "days"}`;
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1.5 text-xl font-bold text-foreground">
        {icon}
        {value}
      </dd>
    </div>
  );
}

/* Badges ------------------------------------------------------------------ */

export async function AdminUserBadges({ params }: { params: IdParams }) {
  const { id } = await params;
  const { badges } = await getAdminUserBadges(id);

  return (
    <Panel title={`Badges${badges.length ? ` · ${badges.length}` : ""}`}>
      {badges.length === 0 ? (
        <EmptyLine>No badges earned yet.</EmptyLine>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {badges.map((badge) => (
            <li className="flex items-center gap-3 py-2.5" key={badge.badgeId}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                <Award className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {badge.name ?? "Badge no longer in the catalogue"}
                </p>
                {badge.description ? (
                  <p className="truncate text-xs text-muted-foreground">{badge.description}</p>
                ) : null}
              </div>
              <time className="shrink-0 text-xs text-muted-foreground" dateTime={badge.earnedAt}>
                {formatDay(badge.earnedAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* Instagram --------------------------------------------------------------- */

// Label in foreground ink with a coloured dot: the tinted text failed
// contrast for amber in light mode, and the dot keeps state off colour alone.
const CONNECTION_STATUS = {
  connected: { label: "Connected", dot: "bg-success" },
  reconnect_required: { label: "Needs reconnecting", dot: "bg-tint-amber" },
  disconnected: { label: "Disconnected", dot: "bg-muted-foreground" },
} as const;

export async function AdminUserPlatform({ params }: { params: IdParams }) {
  const { id } = await params;
  const { instagram } = await getAdminUserPlatform(id);

  return (
    <Panel title="Instagram">
      {instagram ? <InstagramDetails instagram={instagram} /> : (
        <EmptyLine>This creator hasn&apos;t connected Instagram.</EmptyLine>
      )}
    </Panel>
  );
}

function InstagramDetails({ instagram }: { instagram: AdminUserInstagram }) {
  const status = CONNECTION_STATUS[instagram.status];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 font-semibold text-foreground">
          <AtSign aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{instagram.username}</span>
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-foreground">
          <span aria-hidden className={cn("size-1.5 rounded-full", status.dot)} />
          {status.label}
        </span>
      </div>

      <dl className="flex flex-col divide-y divide-border text-sm">
        <Row label="Account type">
          {instagram.accountType
            ? instagram.accountType === "professional"
              ? "Professional"
              : "Personal"
            : "Not checked yet"}
        </Row>
        <Row label={instagram.disconnectedAt ? "Disconnected" : "Connected since"}>
          {formatDay(instagram.disconnectedAt ?? instagram.connectedAt)}
        </Row>
        <Row label="Last successful sync">
          {instagram.lastSyncedAt ? formatDay(instagram.lastSyncedAt) : "No successful sync yet"}
        </Row>
        {/* Consent is stored per connection, so it lives here rather than in
            an account-wide panel (confirmed with the client). */}
        <Row label="Data consent">
          {instagram.consent.granted
            ? `Granted${instagram.consent.grantedAt ? ` ${formatDay(instagram.consent.grantedAt)}` : ""}`
            : "Not granted"}
        </Row>
      </dl>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{children}</dd>
    </div>
  );
}
