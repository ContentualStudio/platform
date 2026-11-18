import { randomBytes, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { returnedRows } from "../content-engine/returned-rows";
import type { SqlQueryable } from "../database/queryable";
import { parsePaidTierKey, type PaidTierKey } from "./billing-tiers";
import { referralStatuses } from "./entities/referral.entity";
import {
  parseSubscriptionStatus,
  type DerivedSubscriptionState,
  type SubscriptionStatus,
} from "./subscription-state";

export interface BillingAccountRow {
  readonly userId: string;
  readonly stripeCustomerId: string | null;
  readonly referralCode: string;
  readonly isFoundingCreator: boolean;
  readonly foundingLockedAmount: number | null;
  readonly foundingLockedCurrency: string | null;
  readonly foundingGrantedAt: Date | null;
  readonly firstPaidAt: Date | null;
}

export interface SubscriptionRow {
  readonly userId: string;
  readonly stripeSubscriptionId: string;
  readonly stripePriceId: string;
  readonly tier: PaidTierKey;
  readonly status: SubscriptionStatus;
  readonly cancelAtPeriodEnd: boolean;
  readonly currentPeriodEnd: Date | null;
  readonly canceledAt: Date | null;
  readonly endedAt: Date | null;
  /** Unix seconds of the last Stripe event applied. */
  readonly lastEventCreated: number;
}

export interface ReferralCounts {
  readonly referred: number;
  readonly converted: number;
  readonly rewarded: number;
}

export type WebhookOutcome =
  | "processing"
  | "applied"
  | "ignored"
  | "stale"
  | "unattributed"
  | "unknown_price";

// No 0/O, 1/I/l: a code is read aloud and typed from a story caption.
const REFERRAL_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const REFERRAL_CODE_LENGTH = 10;

export function generateReferralCode(): string {
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let code = "";

  for (let index = 0; index < REFERRAL_CODE_LENGTH; index += 1) {
    code += REFERRAL_ALPHABET[bytes[index] % REFERRAL_ALPHABET.length];
  }

  return code;
}

const ACCOUNT_COLUMNS = `
  "userId", "stripeCustomerId", "referralCode", "isFoundingCreator",
  "foundingLockedAmount", "foundingLockedCurrency", "foundingGrantedAt",
  "firstPaidAt"
`;

const SUBSCRIPTION_COLUMNS = `
  "userId", "stripeSubscriptionId", "stripePriceId", "tier", "status",
  "cancelAtPeriodEnd", "currentPeriodEnd", "canceledAt", "endedAt",
  "lastEventCreated"
`;

function date(value: unknown): Date | null {
  return value === null || value === undefined ? null : new Date(value as string);
}

function integer(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function mapAccount(row: Record<string, unknown>): BillingAccountRow {
  return {
    userId: String(row.userId),
    stripeCustomerId: (row.stripeCustomerId as string | null) ?? null,
    referralCode: String(row.referralCode),
    isFoundingCreator: row.isFoundingCreator === true,
    foundingLockedAmount: integer(row.foundingLockedAmount),
    foundingLockedCurrency:
      (row.foundingLockedCurrency as string | null) ?? null,
    foundingGrantedAt: date(row.foundingGrantedAt),
    firstPaidAt: date(row.firstPaidAt),
  };
}

function mapSubscription(row: Record<string, unknown>): SubscriptionRow {
  const tier = parsePaidTierKey(row.tier);
  const status = parseSubscriptionStatus(row.status);

  if (!tier || !status) {
    // The CHECK constraints make this unreachable; failing loudly beats
    // handing the entitlement service a row it cannot interpret.
    throw new Error(
      `user_subscription row for ${String(row.userId)} carries an invalid tier or status.`,
    );
  }

  return {
    userId: String(row.userId),
    stripeSubscriptionId: String(row.stripeSubscriptionId),
    stripePriceId: String(row.stripePriceId),
    tier,
    status,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd === true,
    currentPeriodEnd: date(row.currentPeriodEnd),
    canceledAt: date(row.canceledAt),
    endedAt: date(row.endedAt),
    lastEventCreated: integer(row.lastEventCreated) ?? 0,
  };
}

/**
 * Every read and write against the Billing tables.
 *
 * Raw SQL on a `SqlQueryable` rather than TypeORM repositories, for the same
 * reason the enrolment and engine domains do it: a caller inside a
 * transaction hands over its EntityManager, and the write joins that
 * transaction instead of escaping to the default connection. The webhook
 * handler depends on that — the ledger row, the subscription row and the
 * outbox event must commit or roll back together.
 */
@Injectable()
export class BillingRepository {
  constructor(private readonly dataSource: DataSource) {}

  // ── accounts ─────────────────────────────────────────────────────────────

  findAccount(userId: string, queryable: SqlQueryable = this.dataSource) {
    return this.selectAccount(`"userId" = $1`, userId, queryable);
  }

  findAccountForUpdate(userId: string, queryable: SqlQueryable) {
    return this.selectAccount(`"userId" = $1 FOR UPDATE`, userId, queryable);
  }

  findAccountByCustomerId(
    stripeCustomerId: string,
    queryable: SqlQueryable = this.dataSource,
  ) {
    return this.selectAccount(`"stripeCustomerId" = $1`, stripeCustomerId, queryable);
  }

  findAccountByReferralCode(
    referralCode: string,
    queryable: SqlQueryable = this.dataSource,
  ) {
    return this.selectAccount(`"referralCode" = $1`, referralCode, queryable);
  }

  private async selectAccount(
    where: string,
    value: string,
    queryable: SqlQueryable,
  ): Promise<BillingAccountRow | undefined> {
    const rows = returnedRows<Record<string, unknown>>(
      await queryable.query(
        `SELECT ${ACCOUNT_COLUMNS} FROM "billing_account" WHERE ${where}`,
        [value],
      ),
    );

    return rows[0] ? mapAccount(rows[0]) : undefined;
  }

  async userExists(userId: string, queryable: SqlQueryable): Promise<boolean> {
    const rows = returnedRows(
      await queryable.query(`SELECT 1 FROM "user" WHERE "id" = $1`, [userId]),
    );

    return rows.length > 0;
  }

  /** The account row, created with a referral code on first touch. */
  async ensureAccount(
    userId: string,
    queryable: SqlQueryable = this.dataSource,
  ): Promise<BillingAccountRow> {
    const existing = await this.findAccount(userId, queryable);

    if (existing) {
      return existing;
    }

    const rows = returnedRows<Record<string, unknown>>(
      await queryable.query(
        `INSERT INTO "billing_account" ("userId", "referralCode")
         VALUES ($1, $2)
         ON CONFLICT ("userId") DO NOTHING
         RETURNING ${ACCOUNT_COLUMNS}`,
        [userId, generateReferralCode()],
      ),
    );

    if (rows[0]) {
      return mapAccount(rows[0]);
    }

    // Lost a race to another request for the same user: read theirs.
    const raced = await this.findAccount(userId, queryable);

    if (!raced) {
      throw new Error(`Could not create a billing account for ${userId}.`);
    }

    return raced;
  }

  async setStripeCustomerId(
    userId: string,
    stripeCustomerId: string,
    queryable: SqlQueryable = this.dataSource,
  ): Promise<void> {
    await queryable.query(
      `UPDATE "billing_account"
          SET "stripeCustomerId" = COALESCE("stripeCustomerId", $2),
              "updatedAt" = now()
        WHERE "userId" = $1`,
      [userId, stripeCustomerId],
    );
  }

  /** Forgets a Stripe customer that no longer exists; the next checkout creates a new one. */
  async clearStripeCustomerId(
    stripeCustomerId: string,
    queryable: SqlQueryable = this.dataSource,
  ): Promise<string | undefined> {
    const rows = returnedRows<{ userId: string }>(
      await queryable.query(
        `UPDATE "billing_account"
            SET "stripeCustomerId" = NULL, "updatedAt" = now()
          WHERE "stripeCustomerId" = $1
          RETURNING "userId"`,
        [stripeCustomerId],
      ),
    );

    return rows[0]?.userId;
  }

  /** Records the first paid transition; false when one was already recorded. */
  async markFirstPaid(
    userId: string,
    at: Date,
    queryable: SqlQueryable,
  ): Promise<boolean> {
    const rows = returnedRows<{ userId: string }>(
      await queryable.query(
        `UPDATE "billing_account"
            SET "firstPaidAt" = $2, "updatedAt" = now()
          WHERE "userId" = $1 AND "firstPaidAt" IS NULL
          RETURNING "userId"`,
        [userId, at],
      ),
    );

    return rows.length > 0;
  }

  async grantFounding(
    userId: string,
    lockedPrice: { amount: number | null; currency: string | null },
    at: Date,
    queryable: SqlQueryable,
  ): Promise<void> {
    // Both or neither: the CHECK constraint rejects half a price.
    const complete = lockedPrice.amount !== null && lockedPrice.currency !== null;
    const amount = complete ? lockedPrice.amount : null;
    const currency = complete ? lockedPrice.currency : null;

    await queryable.query(
      `UPDATE "billing_account"
          SET "isFoundingCreator" = true,
              "foundingLockedAmount" = COALESCE("foundingLockedAmount", $2),
              "foundingLockedCurrency" = COALESCE("foundingLockedCurrency", $3),
              "foundingGrantedAt" = COALESCE("foundingGrantedAt", $4),
              "updatedAt" = now()
        WHERE "userId" = $1`,
      [userId, amount, currency, at],
    );
  }

  async setFoundingFlag(
    userId: string,
    founding: boolean,
    queryable: SqlQueryable = this.dataSource,
  ): Promise<void> {
    await queryable.query(
      founding
        ? `UPDATE "billing_account"
              SET "isFoundingCreator" = true,
                  "foundingGrantedAt" = COALESCE("foundingGrantedAt", now()),
                  "updatedAt" = now()
            WHERE "userId" = $1`
        : `UPDATE "billing_account"
              SET "isFoundingCreator" = false,
                  "foundingLockedAmount" = NULL,
                  "foundingLockedCurrency" = NULL,
                  "foundingGrantedAt" = NULL,
                  "updatedAt" = now()
            WHERE "userId" = $1`,
      [userId],
    );
  }

  // ── founding cohort ──────────────────────────────────────────────────────

  async foundingClaimed(
    queryable: SqlQueryable = this.dataSource,
  ): Promise<number> {
    const rows = returnedRows<{ claimed: unknown }>(
      await queryable.query(`SELECT "claimed" FROM "founding_cohort" WHERE "id" = 1`),
    );

    return integer(rows[0]?.claimed) ?? 0;
  }

  /**
   * Takes one founding seat if any remain. The guard and the increment are one
   * statement, so two purchases racing for the last seat cannot both win.
   */
  async claimFoundingSeat(
    cap: number,
    queryable: SqlQueryable,
  ): Promise<boolean> {
    const rows = returnedRows<{ claimed: unknown }>(
      await queryable.query(
        `UPDATE "founding_cohort"
            SET "claimed" = "claimed" + 1, "updatedAt" = now()
          WHERE "id" = 1 AND "claimed" < $1
          RETURNING "claimed"`,
        [cap],
      ),
    );

    return rows.length > 0;
  }

  // ── subscriptions ────────────────────────────────────────────────────────

  findSubscription(userId: string, queryable: SqlQueryable = this.dataSource) {
    return this.selectSubscription(userId, queryable, "");
  }

  findSubscriptionForUpdate(userId: string, queryable: SqlQueryable) {
    return this.selectSubscription(userId, queryable, "FOR UPDATE");
  }

  private async selectSubscription(
    userId: string,
    queryable: SqlQueryable,
    lock: "" | "FOR UPDATE",
  ): Promise<SubscriptionRow | undefined> {
    const rows = returnedRows<Record<string, unknown>>(
      await queryable.query(
        `SELECT ${SUBSCRIPTION_COLUMNS} FROM "user_subscription" WHERE "userId" = $1 ${lock}`,
        [userId],
      ),
    );

    return rows[0] ? mapSubscription(rows[0]) : undefined;
  }

  async upsertSubscription(
    userId: string,
    state: DerivedSubscriptionState,
    lastEventCreated: number,
    queryable: SqlQueryable,
  ): Promise<void> {
    await queryable.query(
      `INSERT INTO "user_subscription" (
         "userId", "stripeSubscriptionId", "stripePriceId", "tier", "status",
         "cancelAtPeriodEnd", "currentPeriodEnd", "canceledAt", "endedAt",
         "lastEventCreated"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT ("userId") DO UPDATE SET
         "stripeSubscriptionId" = EXCLUDED."stripeSubscriptionId",
         "stripePriceId" = EXCLUDED."stripePriceId",
         "tier" = EXCLUDED."tier",
         "status" = EXCLUDED."status",
         "cancelAtPeriodEnd" = EXCLUDED."cancelAtPeriodEnd",
         "currentPeriodEnd" = EXCLUDED."currentPeriodEnd",
         "canceledAt" = EXCLUDED."canceledAt",
         "endedAt" = EXCLUDED."endedAt",
         "lastEventCreated" = EXCLUDED."lastEventCreated",
         "updatedAt" = now()`,
      [
        userId,
        state.stripeSubscriptionId,
        state.stripePriceId,
        state.tier,
        state.status,
        state.cancelAtPeriodEnd,
        state.currentPeriodEnd,
        state.canceledAt,
        state.endedAt,
        lastEventCreated,
      ],
    );
  }

  // ── webhook ledger ───────────────────────────────────────────────────────

  /** False when the event id is already on the ledger. */
  async recordWebhookEvent(
    event: { id: string; type: string; created: number },
    queryable: SqlQueryable,
  ): Promise<boolean> {
    const rows = returnedRows<{ stripeEventId: string }>(
      await queryable.query(
        `INSERT INTO "billing_webhook_event" ("stripeEventId", "type", "stripeCreated", "outcome")
         VALUES ($1, $2, $3, 'processing')
         ON CONFLICT ("stripeEventId") DO NOTHING
         RETURNING "stripeEventId"`,
        [event.id, event.type, event.created],
      ),
    );

    return rows.length > 0;
  }

  async finishWebhookEvent(
    eventId: string,
    result: {
      outcome: WebhookOutcome;
      userId?: string | null;
      stripeCustomerId?: string | null;
      detail?: string | null;
    },
    queryable: SqlQueryable,
  ): Promise<void> {
    await queryable.query(
      `UPDATE "billing_webhook_event"
          SET "outcome" = $2, "userId" = $3, "stripeCustomerId" = $4, "detail" = $5
        WHERE "stripeEventId" = $1`,
      [
        eventId,
        result.outcome,
        result.userId ?? null,
        result.stripeCustomerId ?? null,
        result.detail ?? null,
      ],
    );
  }

  // ── referrals ────────────────────────────────────────────────────────────

  /** False when the referred user is already attributed to somebody. */
  async insertReferral(
    input: { referrerUserId: string; referredUserId: string; referralCode: string },
    queryable: SqlQueryable = this.dataSource,
  ): Promise<boolean> {
    const rows = returnedRows<{ id: string }>(
      await queryable.query(
        `INSERT INTO "referral" ("id", "referrerUserId", "referredUserId", "referralCode")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("referredUserId") DO NOTHING
         RETURNING "id"`,
        [randomUUID(), input.referrerUserId, input.referredUserId, input.referralCode],
      ),
    );

    return rows.length > 0;
  }

  /**
   * Advances the referred user's record to converted, once. Returns the
   * referrer's id when this call did the advancing, so a re-delivered event
   * cannot trigger the reward path twice.
   */
  async markReferralConverted(
    referredUserId: string,
    conversionEventId: string,
    at: Date,
    queryable: SqlQueryable,
  ): Promise<string | undefined> {
    const rows = returnedRows<{ referrerUserId: string }>(
      await queryable.query(
        `UPDATE "referral"
            SET "status" = $3, "convertedAt" = $4, "conversionEventId" = $2
          WHERE "referredUserId" = $1 AND "status" = $5
          RETURNING "referrerUserId"`,
        [
          referredUserId,
          conversionEventId,
          referralStatuses.converted,
          at,
          referralStatuses.referred,
        ],
      ),
    );

    return rows[0]?.referrerUserId;
  }

  /** Id of the oldest conversion the referrer has not yet been rewarded for. */
  async nextUnrewardedReferralId(
    referrerUserId: string,
    queryable: SqlQueryable = this.dataSource,
  ): Promise<string | undefined> {
    const rows = returnedRows<{ id: string }>(
      await queryable.query(
        `SELECT "id" FROM "referral"
          WHERE "referrerUserId" = $1 AND "status" = $2
          ORDER BY "convertedAt" ASC NULLS LAST, "createdAt" ASC
          LIMIT 1`,
        [referrerUserId, referralStatuses.converted],
      ),
    );

    return rows[0]?.id;
  }

  /** False when another process rewarded this referral first. */
  async markReferralRewarded(
    referralId: string,
    rewardReference: string,
    at: Date,
    queryable: SqlQueryable = this.dataSource,
  ): Promise<boolean> {
    const rows = returnedRows<{ id: string }>(
      await queryable.query(
        `UPDATE "referral"
            SET "status" = $3, "rewardedAt" = $4, "rewardReference" = $2
          WHERE "id" = $1 AND "status" = $5
          RETURNING "id"`,
        [
          referralId,
          rewardReference,
          referralStatuses.rewarded,
          at,
          referralStatuses.converted,
        ],
      ),
    );

    return rows.length > 0;
  }

  async referralCounts(
    referrerUserId: string,
    queryable: SqlQueryable = this.dataSource,
  ): Promise<ReferralCounts> {
    const rows = returnedRows<{ status: string; count: unknown }>(
      await queryable.query(
        `SELECT "status", COUNT(*) AS "count" FROM "referral"
          WHERE "referrerUserId" = $1
          GROUP BY "status"`,
        [referrerUserId],
      ),
    );
    const byStatus = new Map(rows.map((row) => [row.status, integer(row.count) ?? 0]));
    const rewarded = byStatus.get(referralStatuses.rewarded) ?? 0;
    const converted = (byStatus.get(referralStatuses.converted) ?? 0) + rewarded;
    const referred = (byStatus.get(referralStatuses.referred) ?? 0) + converted;

    // Cumulative on purpose: everyone rewarded also converted and was
    // referred, which is how the account page reads the three numbers.
    return { referred, converted, rewarded };
  }
}
