import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  dailySeries,
  parseFiringFilters,
  sortRuleSummary,
  TREND_DAYS,
  trendStart,
  type RuleSummaryRow,
} from "./engine-activity";

const now = new Date("2026-10-14T09:30:00.000Z");

test("filters keep a rule id and a known event, and drop blanks and unknown events", () => {
  assert.deepEqual(parseFiringFilters({ rule: " rule-1 ", event: "task.completed" }), {
    ruleId: "rule-1",
    eventName: "task.completed",
  });
  assert.deepEqual(parseFiringFilters({ rule: "", event: "not.an.event" }), {
    ruleId: null,
    eventName: null,
  });
  assert.deepEqual(parseFiringFilters({ rule: ["a", "b"] }), { ruleId: null, eventName: null });
});

test("the trend window ends today and covers the trend length", () => {
  assert.equal(trendStart(now), "2026-09-15");

  const series = dailySeries([], now);
  assert.equal(series.length, TREND_DAYS);
  assert.equal(series[0]!.day, "2026-09-15");
  assert.equal(series[series.length - 1]!.day, "2026-10-14");
});

test("days without firings are zeros, not gaps", () => {
  const series = dailySeries(
    [
      { day: "2026-10-14", firings: 3 },
      { day: "2026-10-01", firings: 1 },
      // Outside the window: ignored.
      { day: "2026-09-01", firings: 9 },
    ],
    now,
  );

  assert.equal(series.find((point) => point.day === "2026-10-14")!.firings, 3);
  assert.equal(series.find((point) => point.day === "2026-10-01")!.firings, 1);
  assert.equal(series.find((point) => point.day === "2026-10-02")!.firings, 0);
  assert.equal(series.reduce((sum, point) => sum + point.firings, 0), 4);
});

test("authored rules sort by name before rules that only survive in the ledger", () => {
  const row = (ruleId: string, name: string | null): RuleSummaryRow => ({
    ruleId,
    name,
    triggerEvent: null,
    active: null,
    firings: 0,
    lastFiredAt: null,
  });

  assert.deepEqual(
    sortRuleSummary([row("z-gone", null), row("2", "Welcome"), row("a-gone", null), row("1", "Badge")]).map(
      (rule) => rule.ruleId,
    ),
    ["1", "2", "a-gone", "z-gone"],
  );
});
