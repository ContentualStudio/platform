import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  isProgrammeOverdue,
  lastProgrammeDay,
  supportAvailability,
  type SupportActiveProgramme,
  type SupportState,
} from "./support-actions";

const programme: SupportActiveProgramme = {
  enrolmentId: "enrolment-1",
  programmeSlug: "thirty-day-foundations",
  day1ScheduledFor: "2026-09-01",
  durationDays: 30,
  currentDay: 30,
};

function state(overrides: Partial<SupportState> = {}): SupportState {
  return { isFoundingCreator: false, activeProgramme: null, today: "2026-10-14", ...overrides };
}

test("the last programme day counts day 1 as the first of its duration", () => {
  assert.equal(lastProgrammeDay(programme), "2026-09-30");
  assert.equal(lastProgrammeDay({ ...programme, durationDays: 1 }), "2026-09-01");
  // Crosses a month and a year.
  assert.equal(
    lastProgrammeDay({ ...programme, day1ScheduledFor: "2026-12-20", durationDays: 15 }),
    "2027-01-03",
  );
});

test("a programme is overdue only once the user's today is past its last day", () => {
  assert.equal(isProgrammeOverdue(programme, "2026-09-30"), false);
  assert.equal(isProgrammeOverdue(programme, "2026-10-01"), true);
});

test("grant applies to a non-founding user and is a no-op for a founding one", () => {
  assert.deepEqual(supportAvailability("grant_founding", state()), { status: "available" });
  assert.equal(
    supportAvailability("grant_founding", state({ isFoundingCreator: true })).status,
    "satisfied",
  );
});

test("unflag applies to a founding user and is a no-op otherwise", () => {
  assert.deepEqual(
    supportAvailability("unflag_founding", state({ isFoundingCreator: true })),
    { status: "available" },
  );
  assert.equal(supportAvailability("unflag_founding", state()).status, "satisfied");
});

test("release applies only to an overdue active programme", () => {
  assert.equal(supportAvailability("release_programme", state()).status, "satisfied");
  assert.deepEqual(
    supportAvailability("release_programme", state({ activeProgramme: programme })),
    { status: "available" },
  );

  const running = supportAvailability(
    "release_programme",
    state({ activeProgramme: programme, today: "2026-09-20" }),
  );
  assert.equal(running.status, "blocked");
  assert.match(running.status === "blocked" ? running.reason : "", /2026-09-30/);
});
