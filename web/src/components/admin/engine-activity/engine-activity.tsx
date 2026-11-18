import { Activity, Hourglass, SearchX } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState, emptyStateActionClassName } from "@/components/admin/empty-state";
import { FiringFilterControls } from "@/components/admin/engine-activity/firing-filters";
import { FiringsTrendChart } from "@/components/admin/engine-activity/firings-trend-chart";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/admin/admin-format";
import {
  getBadgeCooldownLog,
  getEngineFirings,
  getEngineRuleActivity,
  type CooldownRow,
  type CooldownStatus,
  type FiringRow,
  type RuleSummaryRow,
} from "@/lib/admin/admin-engine-activity";
import {
  engineActivityHref,
  parseEngineActivitySearch,
} from "@/lib/admin/engine-activity-search";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const headClassName =
  "h-10 px-4 text-2xs font-semibold uppercase tracking-wide text-muted-foreground";

/** A bordered section with a title row; `toolbar` sits beside the title. */
function Section({
  title,
  id,
  toolbar,
  children,
}: {
  title: string;
  id: string;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="shrink-0 text-sm font-semibold text-foreground" id={id}>
          {title}
        </h2>
        {toolbar}
      </div>
      {children}
    </section>
  );
}

/** Missing content keeps working: a name the mirror no longer has shows its stored id. */
function Missing({ id }: { id: string }) {
  return (
    <span className="flex flex-col">
      <span className="font-mono text-xs text-foreground">{id}</span>
      <span className="text-xs text-muted-foreground">No longer in content</span>
    </span>
  );
}

function UserCell({ userId, name, email, from }: { userId: string; name: string | null; email: string | null; from: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <Link
        className="truncate font-semibold text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
        href={`/admin/users/${encodeURIComponent(userId)}?from=${encodeURIComponent(from)}`}
      >
        {name || email || userId}
      </Link>
      {name && email ? <span className="truncate text-xs text-muted-foreground">{email}</span> : null}
    </span>
  );
}

function Capped({ shown, limit, noun }: { shown: number; limit: number; noun: string }) {
  if (shown < limit) return null;

  return (
    <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
      Showing the latest {limit} {noun}.
    </p>
  );
}

// —— Firings per day ——————————————————————————————————————————————————

export async function EngineFiringsTrend() {
  const { daily } = await getEngineRuleActivity();
  const total = daily.reduce((sum, point) => sum + point.firings, 0);

  return (
    <Section
      id="firings-trend"
      title="Firings per day"
      toolbar={
        <span className="text-sm text-muted-foreground tabular-nums">
          {total.toLocaleString("en-GB")} in the last {daily.length} days (UTC)
        </span>
      }
    >
      <div className="px-4 py-4">
        <FiringsTrendChart data={daily} />
      </div>
    </Section>
  );
}

// —— Per-rule summary —————————————————————————————————————————————————

/**
 * Every authored rule with whether it has fired and when it last did, so a
 * rule someone just published and that never triggers stands out.
 */
export async function EngineRuleSummary() {
  const { rules } = await getEngineRuleActivity();

  return (
    <Section id="rules" title="Rules">
      {rules.length === 0 ? (
        <EmptyState
          description="Rules published from the Studio appear here with whether they have fired."
          icon={Activity}
          title="No rules published yet"
        />
      ) : (
        <ul className="divide-y divide-border">
          {rules.map((rule) => (
            <RuleSummaryItem key={rule.ruleId} rule={rule} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function RuleSummaryItem({ rule }: { rule: RuleSummaryRow }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        {rule.name ? (
          <span className="flex items-center gap-2">
            <Link
              className="truncate font-semibold text-foreground hover:underline"
              href={engineActivityHref({ ruleId: rule.ruleId })}
              scroll={false}
            >
              {rule.name}
            </Link>
            {rule.active === false ? <Badge variant="outline">Inactive</Badge> : null}
          </span>
        ) : (
          <Missing id={rule.ruleId} />
        )}
        {rule.triggerEvent ? (
          <span className="font-mono text-xs text-muted-foreground">on {rule.triggerEvent}</span>
        ) : null}
      </div>

      <div className="shrink-0 text-sm sm:text-right">
        {rule.firings === 0 ? (
          <Badge variant="destructive">Never fired</Badge>
        ) : (
          <span className="flex flex-col">
            <span className="font-semibold text-foreground tabular-nums">
              {rule.firings.toLocaleString("en-GB")} {rule.firings === 1 ? "firing" : "firings"}
            </span>
            <span className="text-xs text-muted-foreground">
              Last {formatDateTime(rule.lastFiredAt!)}
            </span>
          </span>
        )}
      </div>
    </li>
  );
}

// —— Firing log —————————————————————————————————————————————————————

/** The firing log, newest first, narrowed by the rule and event in the URL. */
export async function EngineFiringLog({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseEngineActivitySearch(await searchParams);
  const log = await getEngineFirings(filters);
  const filtered = Boolean(log.filters.ruleId || log.filters.eventName);
  const from = engineActivityHref(log.filters);

  return (
    <Section
      id="firing-log"
      title="Firing log"
      toolbar={
        <div className="sm:max-w-xl">
          <FiringFilterControls
            events={log.options.events}
            filters={log.filters}
            rules={log.options.rules}
          />
        </div>
      }
    >
      {log.firings.length === 0 ? (
        filtered ? (
          <EmptyState
            action={
              <Link className={emptyStateActionClassName} href={engineActivityHref({})} scroll={false}>
                Clear filters
              </Link>
            }
            description="Nothing has fired for this rule and event yet."
            icon={SearchX}
            title="No matching firings"
          />
        ) : (
          <EmptyState
            description="When a rule fires for a creator, it's listed here."
            icon={Activity}
            title="No firings recorded yet"
          />
        )
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={headClassName}>Rule</TableHead>
                <TableHead className={headClassName}>User</TableHead>
                <TableHead className={headClassName}>Event</TableHead>
                <TableHead className={headClassName}>Fired</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {log.firings.map((firing) => (
                <FiringItem firing={firing} from={from} key={firing.id} />
              ))}
            </TableBody>
          </Table>
          <Capped limit={log.limit} noun="firings" shown={log.firings.length} />
        </>
      )}
    </Section>
  );
}

function FiringItem({ firing, from }: { firing: FiringRow; from: string }) {
  return (
    <TableRow>
      <TableCell className="px-4 py-3 font-semibold text-foreground">
        {firing.ruleName ?? <Missing id={firing.ruleId} />}
      </TableCell>
      <TableCell className="max-w-64 px-4 py-3">
        <UserCell email={firing.userEmail} from={from} name={firing.userName} userId={firing.userId} />
      </TableCell>
      <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">
        {firing.eventName ?? "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap px-4 py-3 text-muted-foreground tabular-nums">
        {formatDateTime(firing.firedAt)}
      </TableCell>
    </TableRow>
  );
}

// —— Badge cooldown queue ————————————————————————————————————————————————

const statusLabels: Record<CooldownStatus, { label: string; variant: "accent" | "outline" | "secondary" }> = {
  queued: { label: "Queued", variant: "accent" },
  released: { label: "Released", variant: "outline" },
  suppressed: { label: "Suppressed", variant: "secondary" },
};

/**
 * Badges waiting on the 24-hour spacing, and what happened to the ones that
 * left the queue.
 */
export async function BadgeCooldownLog() {
  const log = await getBadgeCooldownLog();
  const from = engineActivityHref({});

  return (
    <Section
      id="cooldown-log"
      title="Badge cooldown queue"
      toolbar={
        <span className="text-sm text-muted-foreground tabular-nums">
          {log.counts.queued} queued · {log.counts.released} released · {log.counts.suppressed} suppressed
        </span>
      }
    >
      {log.entries.length === 0 ? (
        <EmptyState
          description="Badges earned within 24 hours of another wait here before they're shown."
          icon={Hourglass}
          title="Queue is empty"
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={headClassName}>Badge</TableHead>
                <TableHead className={headClassName}>User</TableHead>
                <TableHead className={headClassName}>Status</TableHead>
                <TableHead className={headClassName}>Queued</TableHead>
                <TableHead className={headClassName}>Released</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {log.entries.map((entry) => (
                <CooldownItem entry={entry} from={from} key={entry.id} />
              ))}
            </TableBody>
          </Table>
          <Capped limit={log.limit} noun="entries" shown={log.entries.length} />
        </>
      )}
    </Section>
  );
}

function CooldownItem({ entry, from }: { entry: CooldownRow; from: string }) {
  const status = statusLabels[entry.status];

  return (
    <TableRow>
      <TableCell className="px-4 py-3 font-semibold text-foreground">
        {entry.badgeName ?? <Missing id={entry.badgeId} />}
      </TableCell>
      <TableCell className="max-w-64 px-4 py-3">
        <UserCell email={entry.userEmail} from={from} name={entry.userName} userId={entry.userId} />
      </TableCell>
      <TableCell className="px-4 py-3">
        <Badge variant={status.variant}>{status.label}</Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap px-4 py-3 text-muted-foreground tabular-nums">
        {formatDateTime(entry.enqueuedAt)}
      </TableCell>
      <TableCell className="whitespace-nowrap px-4 py-3 text-muted-foreground tabular-nums">
        {entry.releasedAt ? formatDateTime(entry.releasedAt) : "—"}
      </TableCell>
    </TableRow>
  );
}

// —— Skeletons ——————————————————————————————————————————————————————

export function SectionSkeleton({ title, rows = 4, height }: { title: string; rows?: number; height?: string }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-background">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">{title}</h2>
      <div aria-hidden data-skeleton>
        {height ? (
          <div className={`m-4 rounded-sm bg-foreground/5 ${height}`} />
        ) : (
          Array.from({ length: rows }).map((_, index) => (
            <div className="flex h-14 items-center gap-4 border-b border-border px-4 last:border-0" key={index}>
              <div className="h-3 w-40 rounded-xs bg-foreground/10" />
              <div className="h-3 w-56 rounded-xs bg-foreground/5" />
            </div>
          ))
        )}
      </div>
    </section>
  );
}
