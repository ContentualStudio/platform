import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildProgrammeCompletionReport,
  type LatestJourney,
} from "./programme-completion";

const programmes = [
  { slug: "first-take", title: "First Take" },
  { slug: "reset", title: "Sixty Day Reset" },
  { slug: "quiet", title: "Quiet Programme" },
];

function journey(
  enrolmentId: string,
  programmeSlug: string,
  status: LatestJourney["status"],
): LatestJourney {
  return { enrolmentId, programmeSlug, status };
}

const completion = (entries: Record<string, number>) =>
  new Map(
    Object.entries(entries).map(([id, completionPercent]) => [id, { completionPercent }]),
  );

test("counts statuses per programme and averages completion", () => {
  const report = buildProgrammeCompletionReport(
    programmes,
    [
      journey("a", "first-take", "active"),
      journey("b", "first-take", "completed"),
      journey("c", "first-take", "abandoned"),
      journey("d", "reset", "completed"),
    ],
    completion({ a: 40, b: 100, c: 10, d: 95 }),
  );

  assert.deepEqual(report.programmes[0], {
    slug: "first-take",
    title: "First Take",
    participants: 3,
    active: 1,
    completed: 1,
    droppedOff: 1,
    averageCompletion: 50,
  });
});

test("a programme with no participants shows zeros and no average", () => {
  const report = buildProgrammeCompletionReport(programmes, [], new Map());
  const quiet = report.programmes.find((row) => row.slug === "quiet");

  assert.deepEqual(quiet, {
    slug: "quiet",
    title: "Quiet Programme",
    participants: 0,
    active: 0,
    completed: 0,
    droppedOff: 0,
    averageCompletion: null,
  });
  assert.equal(report.summary.averageCompletion, null);
  assert.equal(report.summary.completionRate, null);
});

test("statuses always sum to participants", () => {
  const report = buildProgrammeCompletionReport(
    programmes,
    [
      journey("a", "reset", "active"),
      journey("b", "reset", "abandoned"),
      journey("c", "reset", "completed"),
      journey("d", "reset", "completed"),
    ],
    completion({ a: 0, b: 0, c: 100, d: 100 }),
  );

  for (const row of [...report.programmes, report.summary]) {
    assert.equal(row.active + row.completed + row.droppedOff, row.participants);
  }
});

test("completion rate counts only journeys that have ended", () => {
  const report = buildProgrammeCompletionReport(
    programmes,
    [
      journey("a", "reset", "completed"),
      journey("b", "reset", "completed"),
      journey("c", "reset", "completed"),
      journey("d", "reset", "abandoned"),
      // Still running: neither a success nor a failure yet.
      journey("e", "reset", "active"),
      journey("f", "reset", "active"),
    ],
    completion({}),
  );

  assert.equal(report.summary.completionRate, 75);
});

test("active-only data has no completion rate yet", () => {
  const report = buildProgrammeCompletionReport(
    programmes,
    [journey("a", "reset", "active")],
    completion({ a: 30 }),
  );

  assert.equal(report.summary.completionRate, null);
  assert.equal(report.summary.averageCompletion, 30);
});

test("a journey on an unpublished programme keeps its slug and no invented title", () => {
  const report = buildProgrammeCompletionReport(
    programmes,
    [journey("a", "retired-programme", "abandoned")],
    completion({ a: 20 }),
  );
  const retired = report.programmes.find((row) => row.slug === "retired-programme");

  assert.equal(retired?.title, null);
  assert.equal(retired?.participants, 1);
});

test("rows are busiest first, ties alphabetical", () => {
  const report = buildProgrammeCompletionReport(
    programmes,
    [journey("a", "reset", "active"), journey("b", "reset", "active")],
    completion({}),
  );

  assert.deepEqual(
    report.programmes.map((row) => row.slug),
    ["reset", "first-take", "quiet"],
  );
});

test("averages round to one decimal", () => {
  const report = buildProgrammeCompletionReport(
    programmes,
    [
      journey("a", "reset", "active"),
      journey("b", "reset", "active"),
      journey("c", "reset", "active"),
    ],
    completion({ a: 10, b: 10, c: 11 }),
  );

  assert.equal(report.programmes[0]?.averageCompletion, 10.3);
});
