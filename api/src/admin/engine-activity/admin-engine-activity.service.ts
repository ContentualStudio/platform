import { Injectable } from "@nestjs/common";
import { eventNames } from "@contentual/content-engine-vocabulary";
import { DataSource } from "typeorm";
import { returnedRows } from "../../content-engine/returned-rows";
import {
  COOLDOWN_LOG_LIMIT,
  dailySeries,
  FIRING_LOG_LIMIT,
  iso,
  sortRuleOptions,
  sortRuleSummary,
  trendStart,
  type CooldownLog,
  type CooldownRow,
  type CooldownStatus,
  type FiringFilters,
  type FiringLog,
  type FiringRow,
  type RuleActivity,
  type RuleSummaryRow,
} from "./engine-activity";

// Only `fired` rows: a `reserved` row is an effect still running (or one whose
// holder died and will be retried), not something that happened. The event
// name comes from the event that triggered the firing; a backfilled firing has
// no event row, so it falls back to the rule's own trigger. Left joins keep a
// firing listed when its rule has left the content mirror.
const FIRINGS_SQL = `
  SELECT l."id"::text AS "id", l."ruleId", r."name" AS "ruleName", l."userId",
         u."name" AS "userName", u."email" AS "userEmail",
         COALESCE(e."eventName", r."triggerEvent") AS "eventName", l."firedAt"
    FROM "engine_firing_ledger" l
    LEFT JOIN "user" u ON u."id" = l."userId"
    LEFT JOIN "engine_rules" r ON r."sourceDocumentId" = l."ruleId"
    LEFT JOIN "content_engine_events" e ON e."id" = l."eventRef"
   WHERE l."status" = 'fired'
     AND ($1::text IS NULL OR l."ruleId" = $1)
     AND ($2::text IS NULL OR COALESCE(e."eventName", r."triggerEvent") = $2)
   ORDER BY l."firedAt" DESC, l."id" DESC
   LIMIT ${FIRING_LOG_LIMIT}
`;

// Every rule the picker can offer: the authored ones, plus any the ledger
// still names after the mirror dropped them.
const RULE_OPTIONS_SQL = `
  SELECT "sourceDocumentId" AS "id", "name" FROM "engine_rules"
  UNION
  SELECT DISTINCT l."ruleId", NULL
    FROM "engine_firing_ledger" l
   WHERE NOT EXISTS (SELECT 1 FROM "engine_rules" r WHERE r."sourceDocumentId" = l."ruleId")
`;

const RULE_SUMMARY_SQL = `
  WITH "fired" AS (
    SELECT "ruleId", count(*)::int AS "firings", max("firedAt") AS "lastFiredAt"
      FROM "engine_firing_ledger"
     WHERE "status" = 'fired'
     GROUP BY "ruleId"
  )
  SELECT COALESCE(r."sourceDocumentId", f."ruleId") AS "ruleId", r."name",
         r."triggerEvent", r."active", COALESCE(f."firings", 0) AS "firings",
         f."lastFiredAt"
    FROM "engine_rules" r
    FULL OUTER JOIN "fired" f ON f."ruleId" = r."sourceDocumentId"
`;

const DAILY_SQL = `
  SELECT to_char("firedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "day", count(*)::int AS "firings"
    FROM "engine_firing_ledger"
   WHERE "status" = 'fired' AND "firedAt" >= $1::date
   GROUP BY 1
`;

const COOLDOWN_SQL = `
  SELECT q."id"::text AS "id", q."userId", u."name" AS "userName", u."email" AS "userEmail",
         q."badgeId", b."name" AS "badgeName", q."status", q."enqueuedAt", q."releasedAt"
    FROM "badge_cooldown_queue" q
    LEFT JOIN "user" u ON u."id" = q."userId"
    LEFT JOIN "engine_badges" b ON b."sourceDocumentId" = q."badgeId"
   ORDER BY q."enqueuedAt" DESC, q."id" DESC
   LIMIT ${COOLDOWN_LOG_LIMIT}
`;

const COOLDOWN_COUNTS_SQL = `
  SELECT "status", count(*)::int AS "count" FROM "badge_cooldown_queue" GROUP BY "status"
`;

type Timestamp = Date | string;

/**
 * The admin's read-only window onto the rule engine. Everything is read from
 * the firing ledger and the badge cooldown queue at request time; nothing here
 * fires, enqueues, releases, replays or backfills anything.
 */
@Injectable()
export class AdminEngineActivityService {
  constructor(private readonly dataSource: DataSource) {}

  async firings(filters: FiringFilters): Promise<FiringLog> {
    const [firingResult, ruleResult] = await Promise.all([
      this.dataSource.query(FIRINGS_SQL, [filters.ruleId, filters.eventName]),
      this.dataSource.query(RULE_OPTIONS_SQL),
    ]);
    const rules = returnedRows<{ id: string; name: string | null }>(ruleResult);

    return {
      firings: returnedRows<FiringRow & { firedAt: Timestamp }>(firingResult).map((row) => ({
        ...row,
        firedAt: iso(row.firedAt)!,
      })),
      limit: FIRING_LOG_LIMIT,
      filters,
      options: {
        rules: sortRuleOptions(rules),
        events: [...eventNames],
      },
    };
  }

  async rules(now = new Date()): Promise<RuleActivity> {
    const [summaryResult, dailyResult] = await Promise.all([
      this.dataSource.query(RULE_SUMMARY_SQL),
      this.dataSource.query(DAILY_SQL, [trendStart(now)]),
    ]);

    return {
      rules: sortRuleSummary(
        returnedRows<RuleSummaryRow & { lastFiredAt: Timestamp | null }>(summaryResult).map(
          (row) => ({ ...row, lastFiredAt: iso(row.lastFiredAt) }),
        ),
      ),
      daily: dailySeries(returnedRows<{ day: string; firings: number }>(dailyResult), now),
    };
  }

  async cooldown(): Promise<CooldownLog> {
    const [entryResult, countResult] = await Promise.all([
      this.dataSource.query(COOLDOWN_SQL),
      this.dataSource.query(COOLDOWN_COUNTS_SQL),
    ]);
    const counts: Record<CooldownStatus, number> = { queued: 0, released: 0, suppressed: 0 };

    for (const row of returnedRows<{ status: CooldownStatus; count: number }>(countResult)) {
      counts[row.status] = row.count;
    }

    return {
      counts,
      entries: returnedRows<
        CooldownRow & { enqueuedAt: Timestamp; releasedAt: Timestamp | null }
      >(entryResult).map((row) => ({
        ...row,
        enqueuedAt: iso(row.enqueuedAt)!,
        releasedAt: iso(row.releasedAt),
      })),
      limit: COOLDOWN_LOG_LIMIT,
    };
  }
}
