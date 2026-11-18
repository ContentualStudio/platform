/**
 * The admin's closed set of manual support actions, and when each applies.
 *
 * Pure: the service reads a user's state, this decides what may run against
 * it, and the same decision drives both the panel's enabled/disabled controls
 * and the guard inside the write transaction.
 */

export const supportActionKeys = [
  "grant_founding",
  "unflag_founding",
  "release_programme",
] as const;

export type SupportActionKey = (typeof supportActionKeys)[number];

/** The audit-log `action` each support action writes. */
export const supportAuditActions: Record<SupportActionKey, string> = {
  grant_founding: "support.founding_granted",
  unflag_founding: "support.founding_unflagged",
  release_programme: "support.programme_released",
};

export interface SupportActiveProgramme {
  enrolmentId: string;
  programmeSlug: string;
  /** The user's local date of day 1, YYYY-MM-DD. */
  day1ScheduledFor: string;
  durationDays: number;
  currentDay: number;
}

export interface SupportState {
  isFoundingCreator: boolean;
  activeProgramme: SupportActiveProgramme | null;
  /** The user's local date today, YYYY-MM-DD. */
  today: string;
}

/**
 * What an action would do against the current state:
 * - `available`: its precondition holds and it would change something.
 * - `satisfied`: what it would bring about is already true; applying it is a
 *   no-op (a repeat submission lands here).
 * - `blocked`: its precondition is unmet; it must not run.
 */
export type SupportAvailability =
  | { status: "available" }
  | { status: "satisfied"; reason: string }
  | { status: "blocked"; reason: string };

/** The programme's last scheduled local date, YYYY-MM-DD. */
export function lastProgrammeDay(programme: SupportActiveProgramme): string {
  const [year, month, day] = programme.day1ScheduledFor.split("-").map(Number);
  const last = new Date(Date.UTC(year!, month! - 1, day! + programme.durationDays - 1));

  return last.toISOString().slice(0, 10);
}

/** Overdue: the user's today is past the programme's last day and it is still active. */
export function isProgrammeOverdue(programme: SupportActiveProgramme, today: string): boolean {
  // ISO dates compare correctly as strings.
  return today > lastProgrammeDay(programme);
}

export function supportAvailability(
  action: SupportActionKey,
  state: SupportState,
): SupportAvailability {
  switch (action) {
    case "grant_founding":
      return state.isFoundingCreator
        ? { status: "satisfied", reason: "Already a founding creator." }
        : { status: "available" };

    case "unflag_founding":
      return state.isFoundingCreator
        ? { status: "available" }
        : { status: "satisfied", reason: "Not a founding creator." };

    case "release_programme": {
      const programme = state.activeProgramme;

      if (!programme) {
        return { status: "satisfied", reason: "No active programme to release." };
      }

      return isProgrammeOverdue(programme, state.today)
        ? { status: "available" }
        : {
            status: "blocked",
            reason: `The programme is still running. Its last day is ${lastProgrammeDay(programme)}.`,
          };
    }
  }
}
