// Day 1 scheduling for "Begin Programme".
//
// The user commits to N days per week (Stage 2) and has a timezone (Stage 1).
// "Next available day" is the start of the next calendar day in the user's
// own timezone — so a user in Sydney and a user in LA who both begin at the
// same instant get a Day 1 that reads as *their* tomorrow, not the server's.
//
// Cadence (which weekdays the remaining tasks fall on) is derived from the
// committed days-per-week and is owned downstream by [Programmes & Tasks];
// here we only fix the Day 1 anchor.
import { timezoneOffsetMs, zonedParts, type DateParts } from "../../common/timezone";

export function scheduleDayOne(now: Date, timezone: string): Date {
  const zoned = zonedParts(now, timezone);

  // Midnight tomorrow, expressed as a wall-clock time in `timezone`, converted
  // back to an absolute instant.
  return wallClockToUtc(
    { year: zoned.year, month: zoned.month, day: zoned.day + 1 },
    timezone,
  );
}

// Interpret the given Y/M/D as 00:00 local wall-clock in `timezone` and return
// the corresponding UTC instant. Uses the timezone's offset at that date to
// invert the conversion (correct outside the ~1h/yr DST transition windows,
// which do not matter for a day-granularity Day 1 anchor).
function wallClockToUtc(parts: DateParts, timezone: string): Date {
  // Normalize (handles day rolling over month/year, e.g. Jan 32 -> Feb 1).
  const guess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const offsetMs = timezoneOffsetMs(guess, timezone);
  return new Date(guess.getTime() - offsetMs);
}
