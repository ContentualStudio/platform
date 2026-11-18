const DAY_MS = 24 * 60 * 60 * 1000;

const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "5 Oct 2026". UTC, so a date reads the same for every team member. */
export function formatDay(iso: string): string {
  return dayFormatter.format(new Date(iso));
}

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** "14 Oct 2026, 08:05 UTC": for events where the time of day matters. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${dayFormatter.format(date)}, ${timeFormatter.format(date)} UTC`;
}

function utcDayNumber(date: Date) {
  return Math.floor(date.getTime() / DAY_MS);
}

/**
 * How long ago a user was last seen, for scanning a list.
 *
 * A `day`-precision value is a calendar date with no time, so it never claims
 * hours: it reads as Today / Yesterday / N days ago at best.
 */
export function formatLastActive(
  lastActive: { at: string; precision: "time" | "day" },
  now: Date,
): string {
  const at = new Date(lastActive.at);
  const days = utcDayNumber(now) - utcDayNumber(at);

  if (lastActive.precision === "time") {
    const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`;
  }

  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;

  return formatDay(lastActive.at);
}

export type PageToken = number | "ellipsis-start" | "ellipsis-end";

/**
 * The page numbers to show: always the first and last, the current page and
 * its neighbours, with an ellipsis standing in for any gap of two or more.
 */
export function pageTokens(current: number, totalPages: number): PageToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  const tokens: PageToken[] = [1];

  if (start > 2) tokens.push("ellipsis-start");
  for (let page = start; page <= end; page += 1) tokens.push(page);
  if (end < totalPages - 1) tokens.push("ellipsis-end");
  tokens.push(totalPages);

  return tokens;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? `${parts[0]![0]}${parts[parts.length - 1]![0]}`
      : name.trim().slice(0, 2);

  return letters.toUpperCase() || "?";
}
