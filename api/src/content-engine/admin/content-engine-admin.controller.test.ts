import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { RuleBackfillService } from "../backfill/rule-backfill.service";
import {
  backfillRunStatus,
  type BackfillRunRow,
  type RuleBackfillRunRepository,
} from "../backfill/rule-backfill-run.repository";
import { ContentEngineAdminController } from "./content-engine-admin.controller";

const completedRun: BackfillRunRow = {
  id: "run-1",
  ruleId: "rule-1",
  status: backfillRunStatus.succeeded,
  requestedBy: "admin@example.com",
  pageSize: 200,
  pauseMs: 200,
  maxCandidates: 100_000,
  dryRun: false,
  cursor: null,
  candidatesScanned: 8,
  candidatesFired: 3,
  candidatesSkipped: 4,
  candidatesFailed: 1,
  usersInScope: 7,
  usersFired: 2,
  usersSkipped: 4,
  usersFailed: 1,
  skippedReasons: { already_fired: 3, condition_not_met: 1 },
  failures: [
    { userId: "user-7", stage: "effect", error: "target unavailable" },
  ],
  stoppedBecause: "exhausted",
  refusal: null,
  lastError: null,
  createdAt: new Date("2026-07-29T12:00:00.000Z"),
  startedAt: new Date("2026-07-29T12:00:01.000Z"),
  finishedAt: new Date("2026-07-29T12:00:10.000Z"),
};

test("the admin run response reports fired, skipped, and failed users", async () => {
  const runs = {
    async findById() {
      return completedRun;
    },
  } as unknown as RuleBackfillRunRepository;

  const controller = new ContentEngineAdminController(
    {} as RuleBackfillService,
    runs,
  );

  const response = await controller.findOne(completedRun.id);

  assert.deepEqual(response.users, {
    inScope: 7,
    fired: 2,
    skipped: 4,
    failed: 1,
  });
});
