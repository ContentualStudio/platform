// Timezone-aware wall-clock helpers shared across every write path that needs
// "what day is it for this user" rather than "what day is it on the server".

export interface DateParts {
  year: number;
  month: number; // 1-12
  day: number;
}

export function zonedParts(instant: Date, timezone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(instant);
  const lookup = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: lookup("year"),
    month: lookup("month"),
    day: lookup("day"),
  };
}

// How far ahead of UTC `timezone` is at `instant`, in milliseconds.
export function timezoneOffsetMs(instant: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(instant);
  const lookup = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  const asUtc = Date.UTC(
    lookup("year"),
    lookup("month") - 1,
    lookup("day"),
    lookup("hour") % 24,
    lookup("minute"),
    lookup("second"),
  );

  return asUtc - instant.getTime();
}

// YYYY-MM-DD wall-clock date in `timezone`, suitable for direct binding to a
// Postgres `date` parameter. Downstream day arithmetic (+1 day, < day - 1)
// must be done as Postgres date operators on the bound value, never as JS
// `Date` math on this string.
export function localDateFor(instant: Date, timezone: string): string {
  const { year, month, day } = zonedParts(instant, timezone);
  const pad = (value: number, width: number) =>
    String(value).padStart(width, "0");

  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

// `timezone` if the runtime recognises it, else UTC. Profile timezones are free
// text, and `Intl` throws on an unknown one — a read should degrade that one
// user to UTC rather than fail.
export function resolveTimezone(timezone: string | null | undefined): string {
  if (!timezone) {
    return "UTC";
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return "UTC";
  }
}

// The YYYY-MM-DD calendar day before `localDate`. Pure calendar arithmetic on
// the date string, so no timezone is involved.
export function previousLocalDate(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));

  return previous.toISOString().slice(0, 10);
}

// The instant `localDate` begins in `timezone` - local midnight, as UTC. The
// offset is read twice because the first guess can sit on the wrong side of a
// DST change; the second read, taken at the corrected instant, is the one in
// force at that midnight.
export function startOfLocalDay(localDate: string, timezone: string): Date {
  const [year, month, day] = localDate.split("-").map(Number);
  const wallClock = Date.UTC(year, month - 1, day);
  const firstGuess = wallClock - timezoneOffsetMs(new Date(wallClock), timezone);

  return new Date(
    wallClock - timezoneOffsetMs(new Date(firstGuess), timezone),
  );
}
