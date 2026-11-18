import type { ProgrammeEnrolmentStatus } from "../../programme-enrolment/entities/programme-enrolment.entity";

/**
 * Pure aggregation for the programme-completion report. The service loads
 * rows and per-journey completion; everything that decides a number lives
 * here, so the definitions are tested without a database.
 *
 * The unit is each user's most recent journey on a programme. That makes
 * active / completed / dropped-off disjoint — they always sum to the
 * participant count — and a user who finished and then restarted counts
 * once, by where they are now.
 */

// The enrolment's own status type: a status added there becomes a type error
// in add() below rather than a journey that counts in no bucket.
export type JourneyStatus = ProgrammeEnrolmentStatus;

export interface LatestJourney {
  enrolmentId: string;
  programmeSlug: string;
  status: JourneyStatus;
}

export interface ProgrammeIdentity {
  slug: string;
  title: string;
}

export interface ProgrammeCompletionRow {
  slug: string;
  /** Null when journeys exist for a programme no longer in the content mirror. */
  title: string | null;
  participants: number;
  active: number;
  completed: number;
  droppedOff: number;
  /** Mean completion % across participants; null when there are none. */
  averageCompletion: number | null;
}

export interface ProgrammeCompletionReport {
  summary: {
    participants: number;
    active: number;
    completed: number;
    droppedOff: number;
    /** completed ÷ (completed + dropped off); null until a journey has ended. */
    completionRate: number | null;
    averageCompletion: number | null;
  };
  programmes: ProgrammeCompletionRow[];
}

interface Tally {
  active: number;
  completed: number;
  droppedOff: number;
  percents: number[];
}

function emptyTally(): Tally {
  return { active: 0, completed: 0, droppedOff: 0, percents: [] };
}

function add(tally: Tally, status: JourneyStatus, percent: number) {
  switch (status) {
    case "active":
      tally.active += 1;
      break;
    case "completed":
      tally.completed += 1;
      break;
    case "abandoned":
      tally.droppedOff += 1;
      break;
    default: {
      // A new enrolment status must be given a bucket here, or the
      // "statuses sum to participants" guarantee breaks.
      const unhandled: never = status;
      throw new Error(`Unhandled enrolment status: ${String(unhandled)}`);
    }
  }
  tally.percents.push(percent);
}

/** Rounded to one decimal; null for an empty set rather than dividing by zero. */
function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;

  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 10) / 10;
}

function rate(completed: number, droppedOff: number): number | null {
  const ended = completed + droppedOff;
  return ended === 0 ? null : Math.round((completed / ended) * 1000) / 10;
}

export function buildProgrammeCompletionReport(
  programmes: readonly ProgrammeIdentity[],
  journeys: readonly LatestJourney[],
  completionByEnrolment: ReadonlyMap<string, { completionPercent: number }>,
): ProgrammeCompletionReport {
  const titles = new Map(programmes.map((programme) => [programme.slug, programme.title]));
  // Every published programme gets a row, participants or not; a journey on
  // an unpublished slug adds its own row rather than being dropped.
  const tallies = new Map<string, Tally>(
    programmes.map((programme) => [programme.slug, emptyTally()]),
  );
  const overall = emptyTally();

  for (const journey of journeys) {
    const percent = completionByEnrolment.get(journey.enrolmentId)?.completionPercent ?? 0;
    const tally = tallies.get(journey.programmeSlug) ?? emptyTally();

    tallies.set(journey.programmeSlug, tally);
    add(tally, journey.status, percent);
    add(overall, journey.status, percent);
  }

  const rows = [...tallies].map(([slug, tally]) => ({
    slug,
    title: titles.get(slug) ?? null,
    participants: tally.percents.length,
    active: tally.active,
    completed: tally.completed,
    droppedOff: tally.droppedOff,
    averageCompletion: mean(tally.percents),
  }));

  // Busiest first; ties alphabetical so the order is stable between loads.
  rows.sort(
    (a, b) =>
      b.participants - a.participants ||
      (a.title ?? a.slug).localeCompare(b.title ?? b.slug),
  );

  return {
    summary: {
      participants: overall.percents.length,
      active: overall.active,
      completed: overall.completed,
      droppedOff: overall.droppedOff,
      completionRate: rate(overall.completed, overall.droppedOff),
      averageCompletion: mean(overall.percents),
    },
    programmes: rows,
  };
}
