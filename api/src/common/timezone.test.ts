import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  previousLocalDate,
  resolveTimezone,
  startOfLocalDay,
} from "./timezone";

test("a recognised timezone is kept", () => {
  assert.equal(resolveTimezone("Europe/London"), "Europe/London");
});

test("a missing or unrecognised timezone falls back to UTC", () => {
  assert.equal(resolveTimezone(null), "UTC");
  assert.equal(resolveTimezone(""), "UTC");
  assert.equal(resolveTimezone("Not/AZone"), "UTC");
});

test("the previous local date crosses month and year ends", () => {
  assert.equal(previousLocalDate("2026-10-14"), "2026-10-13");
  assert.equal(previousLocalDate("2026-03-01"), "2026-02-28");
  assert.equal(previousLocalDate("2027-01-01"), "2026-12-31");
});

test("a local day starts at that timezone's midnight", () => {
  assert.equal(
    startOfLocalDay("2026-10-14", "UTC").toISOString(),
    "2026-10-14T00:00:00.000Z",
  );
  // British Summer Time: midnight in London is 23:00 UTC the day before.
  assert.equal(
    startOfLocalDay("2026-10-14", "Europe/London").toISOString(),
    "2026-10-13T23:00:00.000Z",
  );
  assert.equal(
    startOfLocalDay("2026-01-14", "America/New_York").toISOString(),
    "2026-01-14T05:00:00.000Z",
  );
});

test("a day that starts on a clock change uses the offset in force at midnight", () => {
  // London's clocks go back at 02:00 on 25 Oct 2026; that day still begins
  // under summer time.
  assert.equal(
    startOfLocalDay("2026-10-25", "Europe/London").toISOString(),
    "2026-10-24T23:00:00.000Z",
  );
  // The day after begins under winter time.
  assert.equal(
    startOfLocalDay("2026-10-26", "Europe/London").toISOString(),
    "2026-10-26T00:00:00.000Z",
  );
});
