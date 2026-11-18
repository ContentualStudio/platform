import { Injectable } from "@nestjs/common";
import { InjectEntityManager } from "@nestjs/typeorm";
import { EntityManager } from "typeorm";
import type {
  AppPostgresUserAttributeReader,
  UserAttributeName,
  UserAttributeValueByName,
} from "@contentual/content-engine-vocabulary";
import { effectiveTierFor } from "../billing/subscription-state";
import { taskProgressOutcomes } from "../programme-tasks/entities/programme-task-progress.entity";
import { returnedRows } from "./returned-rows";

// Counted with scalar subqueries rather than joins: a join to two one-to-many
// tables would multiply rows against each other and inflate both counts.
//
// The billing attributes come from the two tables the Stripe webhook owns.
// `subscription_status` is the raw Stripe status so a rule can ask "past
// due?"; the tier it entitles is resolved in code by the same helper the
// entitlement service uses, so a rule and a gate can never disagree about
// what "paid" means. A user with no subscription reads as status "none" and
// tier "free" — definite facts, not unknowns, so a rule on either matches.
const ATTRIBUTES_SQL = `
  SELECT
    "subscription"."status" AS "subscription_status",
    "subscription"."tier" AS "subscription_tier",
    "user_profile"."userType" AS "user_type",
    "user_profile"."experienceLevel" AS "experience_level",
    COALESCE("account"."isFoundingCreator", false) AS "is_founding_creator",
    (
      SELECT COUNT(*) FROM "programme_task_progress"
      WHERE "programme_task_progress"."userId" = "user"."id"
        AND "programme_task_progress"."outcome" = $2
    ) AS "lifetime_task_completions",
    (
      SELECT COUNT(*) FROM "programme_completion"
      WHERE "programme_completion"."userId" = "user"."id"
    ) AS "programmes_completed"
  FROM "user"
  LEFT JOIN "user_profile" ON "user_profile"."userId" = "user"."id"
  LEFT JOIN "billing_account" AS "account" ON "account"."userId" = "user"."id"
  LEFT JOIN "user_subscription" AS "subscription" ON "subscription"."userId" = "user"."id"
  WHERE "user"."id" = $1
`;

const NO_SUBSCRIPTION_STATUS = "none";

// A user the app has never seen has genuinely completed nothing, so the counts
// are 0 rather than null. The profile and billing attributes stay null so a
// condition on them cannot accidentally match.
const UNKNOWN_USER: UserAttributeValueByName = {
  subscription_status: null,
  subscription_tier: null,
  user_type: null,
  experience_level: null,
  is_founding_creator: null,
  lifetime_task_completions: 0,
  programmes_completed: 0,
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

// COUNT() comes back as a bigint, which the postgres driver hands over as a
// string to avoid precision loss. Left as-is it would fail every numeric
// comparison, since the vocabulary requires a finite number.
function count(value: unknown): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Resolves the allowlisted user attributes from app Postgres.
 *
 * One instance serves one evaluation run. Every condition across every rule in
 * that run reads the same user, so the row is fetched once and shared; the
 * cache stores the in-flight promise rather than the resolved value so
 * concurrent conditions coalesce onto a single query instead of racing.
 */
export class UserAttributeReader implements AppPostgresUserAttributeReader {
  private readonly cache = new Map<
    string,
    Promise<UserAttributeValueByName>
  >();

  constructor(private readonly entityManager: EntityManager) {}

  async preload(userId: string): Promise<void> {
    await this.load(userId);
  }

  async read<Name extends UserAttributeName>(
    userId: string,
    attribute: Name,
  ): Promise<UserAttributeValueByName[Name]> {
    const values = await this.load(userId);

    return values[attribute];
  }

  private load(userId: string): Promise<UserAttributeValueByName> {
    const cached = this.cache.get(userId);

    if (cached) {
      return cached;
    }

    const pending = this.fetch(userId);
    this.cache.set(userId, pending);

    return pending;
  }

  private async fetch(userId: string): Promise<UserAttributeValueByName> {
    const rows = returnedRows<Record<string, unknown>>(
      await this.entityManager.query(ATTRIBUTES_SQL, [
        userId,
        taskProgressOutcomes.completed,
      ]),
    );

    const row = rows[0];

    if (!row) {
      return UNKNOWN_USER;
    }

    const status = text(row.subscription_status);

    return {
      subscription_status: status ?? NO_SUBSCRIPTION_STATUS,
      subscription_tier: effectiveTierFor(status, text(row.subscription_tier)),
      user_type: text(row.user_type),
      experience_level: text(row.experience_level),
      is_founding_creator: row.is_founding_creator === true,
      lifetime_task_completions: count(row.lifetime_task_completions),
      programmes_completed: count(row.programmes_completed),
    };
  }
}

/**
 * Mints a reader per evaluation run.
 *
 * The factory is the Nest singleton, not the reader. A singleton reader would
 * accumulate one cache entry per user forever — an unbounded store of user
 * attributes held by a long-lived process, and stale the moment a profile
 * changes. A run-scoped reader keeps the coalescing benefit within the run and
 * drops the data with it.
 */
@Injectable()
export class UserAttributeReaderFactory {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  forEvaluation(): UserAttributeReader {
    return new UserAttributeReader(this.entityManager);
  }
}
