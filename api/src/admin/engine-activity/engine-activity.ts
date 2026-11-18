import { eventNames } from "@contentual/content-engine-vocabulary";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The firing log shows the most recent firings only; filters narrow it. */
export const FIRING_LOG_LIMIT = 100;
export const COOLDOWN_LOG_LIMIT = 100;
/** How many days the firings-per-day trend covers, today included. */
export const TREND_DAYS = 30;

export type CooldownStatus = "queued" | "released" | "suppressed";

export interface FiringFilters {
  ruleId: string | null;
  eventName: string | null;
}

export interface FiringRow {
  id: string;
  ruleId: string;
  /** Null when the rule is no longer in the content mirror. */
  ruleName: string | null;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  /** The triggering event's name, or the rule's trigger when the event row is gone. */
  eventName: string | null;
  firedAt: string;
}

export interface FiringLog {
  firings: FiringRow[];
  limit: number;
  filters: FiringFilters;
  options: {
    rules: { id: string; name: string | null }[];
    events: string[];
  };
}

export interface RuleSummaryRow {
  ruleId: string;
  /** Null for a rule that fired but is no longer in the content mirror. */
  name: string | null;
  triggerEvent: string | null;
  active: boolean | null;
  firings: number;
  lastFiredAt: string | null;
}

export interface RuleActivity {
  rules: RuleSummaryRow[];
  daily: { day: string; firings: number }[];
}

export interface CooldownRow {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  badgeId: string;
  /** Null when the badge is no longer in the content mirror. */
  badgeName: string | null;
  status: CooldownStatus;
  enqueuedAt: string;
  releasedAt: string | null;
}

export interface CooldownLog {
  counts: Record<CooldownStatus, number>;
  entries: CooldownRow[];
  limit: number;
}

function present(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The filters from the query string. An event name outside the vocabulary
 * would match nothing, so it is dropped rather than shown as an empty log
 * under a filter the picker cannot display.
 */
export function parseFiringFilters(query: { rule?: unknown; event?: unknown }): FiringFilters {
  const eventName = present(query.event);

  return {
    ruleId: present(query.rule),
    eventName: eventName && (eventNames as readonly string[]).includes(eventName) ? eventName : null,
  };
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The first UTC day of the trend window ending today. */
export function trendStart(now: Date): string {
  return utcDay(new Date(now.getTime() - (TREND_DAYS - 1) * DAY_MS));
}

/**
 * One point per UTC day of the window, oldest first: a day with no firings is
 * a zero rather than a gap, so a rule that stopped firing reads as a drop.
 */
export function dailySeries(
  counts: { day: string; firings: number }[],
  now: Date,
): { day: string; firings: number }[] {
  const byDay = new Map(counts.map((row) => [row.day, row.firings]));
  const start = new Date(`${trendStart(now)}T00:00:00.000Z`).getTime();

  return Array.from({ length: TREND_DAYS }, (_, index) => {
    const day = utcDay(new Date(start + index * DAY_MS));
    return { day, firings: byDay.get(day) ?? 0 };
  });
}

/**
 * Authored rules first, by name, then rules that only survive in the ledger
 * (removed from the content mirror) by id, so a never-fired rule is easy to
 * find and a vanished one is still accounted for.
 */
export function sortRuleSummary(rows: RuleSummaryRow[]): RuleSummaryRow[] {
  return [...rows].sort((left, right) => compareRules(left.name, left.ruleId, right.name, right.ruleId));
}

/** The rule picker, in the same order as the summary. */
export function sortRuleOptions<T extends { id: string; name: string | null }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => compareRules(left.name, left.id, right.name, right.id));
}

function compareRules(
  leftName: string | null,
  leftId: string,
  rightName: string | null,
  rightId: string,
): number {
  if ((leftName === null) !== (rightName === null)) {
    return leftName === null ? 1 : -1;
  }

  return (leftName ?? leftId).localeCompare(rightName ?? rightId, "en-GB");
}

export function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
