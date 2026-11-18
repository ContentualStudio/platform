import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { AnalyticsSnapshot } from "@/lib/analytics-snapshot";
import {
  defaultWindowFor,
  engagementRate,
  formatSignedPercent,
  growthSummaryLabel,
  periodChangePercent,
  snapshotKpis,
} from "./data";

test("signed percents keep the sign and one decimal place", () => {
  assert.equal(formatSignedPercent(15.3), "+15.3%");
  assert.equal(formatSignedPercent(-8.2), "-8.2%");
  assert.equal(formatSignedPercent(0), "0.0%");
});

test("period change is the delta as a percent of the previous value", () => {
  assert.equal(periodChangePercent(342, 12847)?.toFixed(1), "2.7");
  assert.equal(periodChangePercent(-25, 975)?.toFixed(1), "-2.5");
  assert.equal(periodChangePercent(0, 1000), 0);
  assert.equal(periodChangePercent(50, 50), null);
});

const SNAPSHOT: AnalyticsSnapshot = {
  connectedSince: "2026-10-08T09:00:00.000Z",
  followerDeltaWeek: 342,
  followers: 12847,
  latestDay: {
    localDate: "2026-10-08",
    reach: 2000,
    interactions: 96,
    views: 24300,
    profileViews: 1892,
  },
};

test("snapshot KPIs use Instagram metrics in the design order", () => {
  const kpis = snapshotKpis(SNAPSHOT);

  assert.deepEqual(
    kpis.map((kpi) => kpi.id),
    ["views", "profileVisits", "engagementRate", "followers"],
  );
  assert.deepEqual(
    kpis.map((kpi) => kpi.value),
    ["24.3K", "1.9K", "4.8%", "12.8K"],
  );
  assert.equal(kpis[3].changePercent?.toFixed(1), "2.7");
  assert.ok(kpis.slice(0, 3).every((kpi) => kpi.changePercent === null));
});

test("unreported day metrics read as a dash, never zero", () => {
  const kpis = snapshotKpis({
    ...SNAPSHOT,
    followerDeltaWeek: null,
    latestDay: null,
  });

  assert.deepEqual(
    kpis.map((kpi) => kpi.value),
    ["-", "-", "-", "12.8K"],
  );
  assert.equal(kpis[3].changePercent, null);
});

test("engagement rate is interactions over reach, absent without reach", () => {
  assert.equal(engagementRate(96, 2000), 4.8);
  assert.equal(engagementRate(0, 1), 0);
  assert.equal(engagementRate(5, 0), null);
  assert.equal(engagementRate(null, 100), null);
  assert.equal(engagementRate(5, null), null);
});

test("the growth summary names the window and the follower change", () => {
  assert.equal(
    growthSummaryLabel(2647, 26, 30),
    "+2,647 followers in the last 30 days (+26.0%)",
  );
  assert.equal(
    growthSummaryLabel(-120, -4.1, 7),
    "-120 followers in the last 7 days (-4.1%)",
  );
  assert.equal(growthSummaryLabel(0, 0, 90), "No change in the last 90 days");
});

test("the default growth window is 30 days when allowed, else the longest", () => {
  assert.equal(defaultWindowFor([7, 30, 90]), 30);
  assert.equal(defaultWindowFor([7]), 7);
  assert.equal(defaultWindowFor([7, 90]), 90);
});
