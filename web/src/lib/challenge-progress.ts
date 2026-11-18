// Derives the active-challenge dashboard's day strip and progress ring from
// the only two facts the API records about a running programme: when Day 1 is
// anchored (`day1ScheduledFor`) and how long the programme runs.
//
// Day boundaries are evaluated in the user's own timezone — `day1ScheduledFor`
// is stored as the UTC instant of local midnight (see api schedule.ts), so a
// naive UTC diff would roll the day over at the wrong moment for anyone east
// or west of UTC.
//
// Per-day completion is owned downstream by [Programmes & Tasks]; until that
// lands nothing here can report a day as `completed`, so elapsed days derive
// as `elapsed` rather than inventing a checkmark.

export type ChallengeDayState =
  | "completed"
  | "elapsed"
  | "active"
  | "upcoming";

export interface ChallengeDay {
  dayNumber: number;
  /** Calendar date in the user's timezone, as YYYY-MM-DD. */
  date: string;
  weekdayLabel: string;
  dayOfMonth: string;
  state: ChallengeDayState;
}

export interface ChallengeProgress {
  /** 1-based day the user is on; 0 while Day 1 is still in the future. */
  currentDay: number;
  totalDays: number;
  progressPercent: number;
  days: ChallengeDay[];
  /** False between "Begin Programme" and the Day 1 anchor arriving. */
  hasStarted: boolean;
}

/** The design export's day strip is a single week, not the full programme. */
export const CALENDAR_WINDOW_DAYS = 7;

/**
 * The week of programme days that contains `currentDay`, always `CALENDAR_WINDOW_DAYS`
 * long when the programme is longer than a week. The last week slides back so
 * a 15- or 30-day programme still fills the strip on its final day.
 */
/** A calendar-strip cell — programme day or a rest day on the real calendar. */
export interface CalendarStripDay {
  dayNumber: number | null;
  date: string;
  weekdayLabel: string;
  dayOfMonth: string;
  state: ChallengeDayState;
  isProgrammeDay: boolean;
}

/**
 * The seven calendar days ending on today in the user's timezone. Programme days
 * are merged in when they fall on those dates; other dates render as rest days.
 * This matches the design export, which always highlights today's column.
 */
export function calendarStripAroundToday(
  days: ChallengeDay[],
  timezone: string | null,
  now = new Date(),
): CalendarStripDay[] {
  const todayKey = calendarDateKey(timezone, now);
  const todayDate = parseDateKey(todayKey);
  const programmeByDate = new Map(days.map((day) => [day.date, day]));

  return Array.from({ length: CALENDAR_WINDOW_DAYS }, (_unused, index) => {
    const offset = index - (CALENDAR_WINDOW_DAYS - 1);
    const date = addDays(todayDate, offset);
    const dateKey = date.toISOString().slice(0, 10);
    const programmeDay = programmeByDate.get(dateKey);

    if (programmeDay) {
      return {
        dayNumber: programmeDay.dayNumber,
        date: programmeDay.date,
        weekdayLabel: programmeDay.weekdayLabel,
        dayOfMonth: programmeDay.dayOfMonth,
        state: programmeDay.state,
        isProgrammeDay: true,
      };
    }

    return {
      dayNumber: null,
      date: dateKey,
      weekdayLabel: new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        timeZone: "UTC",
      }).format(date),
      dayOfMonth: String(date.getUTCDate()).padStart(2, "0"),
      state:
        dateKey < todayKey
          ? "elapsed"
          : dateKey === todayKey
            ? "active"
            : "upcoming",
      isProgrammeDay: false,
    };
  });
}

export function calendarWindow(
  days: ChallengeDay[],
  currentDay: number,
): ChallengeDay[] {
  if (days.length <= CALENDAR_WINDOW_DAYS) {
    return days;
  }

  const currentIndex =
    currentDay <= 0 ? 0 : Math.min(currentDay - 1, days.length - 1);
  const weekStart =
    Math.floor(currentIndex / CALENDAR_WINDOW_DAYS) * CALENDAR_WINDOW_DAYS;
  const start = Math.min(weekStart, days.length - CALENDAR_WINDOW_DAYS);

  return days.slice(start, start + CALENDAR_WINDOW_DAYS);
}

/** The programme-day strip keys days by YYYY-MM-DD in the user's timezone. */
export function calendarDateKey(
  timezone: string | null,
  now = new Date(),
): string {
  const zone = resolveTimezone(timezone);
  const parts = zonedParts(now, zone);
  return toUtcMidnight(parts).toISOString().slice(0, 10);
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The Y/M/D an instant falls on when read in `timezone`. */
function zonedParts(instant: Date, timezone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const lookup = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: lookup("year"),
    month: lookup("month"),
    day: lookup("day"),
  };
}

// Calendar dates are compared as UTC midnights so that day arithmetic is a
// plain subtraction, free of DST offsets.
function toUtcMidnight(parts: DateParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

const utcDayLabel = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * "Oct 7" for an instant, read in UTC: calendar dates here are UTC midnights,
 * and a fixed zone keeps the server render and the browser on the same label.
 */
export function formatUtcDay(date: Date): string {
  return utcDayLabel.format(date);
}

/** A YYYY-MM-DD calendar date as its UTC midnight. */
export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function deriveChallengeProgress({
  day1ScheduledFor,
  durationDays,
  timezone,
  now = new Date(),
}: {
  day1ScheduledFor: string | null;
  durationDays: number | null | undefined;
  timezone: string | null;
  now?: Date;
}): ChallengeProgress | null {
  if (!day1ScheduledFor || !durationDays || durationDays < 1) {
    return null;
  }

  const day1Instant = new Date(day1ScheduledFor);

  if (Number.isNaN(day1Instant.getTime())) {
    return null;
  }

  // An unset or unrecognized timezone would make Intl throw; UTC keeps the
  // strip rendering rather than taking the whole dashboard down.
  const zone = resolveTimezone(timezone);

  const day1Date = toUtcMidnight(zonedParts(day1Instant, zone));
  const todayDate = toUtcMidnight(zonedParts(now, zone));

  const elapsedDays = Math.round(
    (todayDate.getTime() - day1Date.getTime()) / MS_PER_DAY,
  );

  const hasStarted = elapsedDays >= 0;
  const currentDay = hasStarted ? clamp(elapsedDays + 1, 1, durationDays) : 0;

  const days: ChallengeDay[] = Array.from(
    { length: durationDays },
    (_unused, index) => {
      const dayNumber = index + 1;
      const date = addDays(day1Date, index);

      return {
        dayNumber,
        date: date.toISOString().slice(0, 10),
        weekdayLabel: new Intl.DateTimeFormat("en-GB", {
          weekday: "short",
          timeZone: "UTC",
        }).format(date),
        dayOfMonth: String(date.getUTCDate()).padStart(2, "0"),
        state: dayState(dayNumber, currentDay),
      };
    },
  );

  return {
    currentDay,
    totalDays: durationDays,
    progressPercent: Math.round((currentDay / durationDays) * 100),
    days,
    hasStarted,
  };
}

function dayState(dayNumber: number, currentDay: number): ChallengeDayState {
  if (currentDay === 0 || dayNumber > currentDay) {
    return "upcoming";
  }

  if (dayNumber === currentDay) {
    return "active";
  }

  return "elapsed";
}

export function resolveTimezone(timezone: string | null): string {
  if (!timezone) {
    return "UTC";
  }

  try {
    // Throws for an unknown zone — that rejection is the whole point of the call.
    const probe = new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return probe.resolvedOptions().timeZone ? timezone : "UTC";
  } catch {
    return "UTC";
  }
}
