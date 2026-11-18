import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { BillingConfigService } from "../../billing/billing-config.service";
import { BillingRepository } from "../../billing/billing.repository";
import { localDateFor, resolveTimezone } from "../../common/timezone";
import { returnedRows } from "../../content-engine/returned-rows";
import type { SqlQueryable } from "../../database/queryable";
import type { AdminIdentity } from "../admin-auth.service";
import {
  isProgrammeOverdue,
  lastProgrammeDay,
  supportActionKeys,
  supportAuditActions,
  supportAvailability,
  type SupportActionKey,
  type SupportActiveProgramme,
  type SupportAvailability,
  type SupportState,
} from "./support-actions";

const USER_SQL = `
  SELECT u."id", u."email", up."timezone"
    FROM "user" u
    LEFT JOIN "user_profile" up ON up."userId" = u."id"
   WHERE u."id" = $1
`;

const FOUNDING_SQL = `
  SELECT "isFoundingCreator", "foundingLockedAmount", "foundingLockedCurrency",
         "foundingGrantedAt"
    FROM "billing_account"
   WHERE "userId" = $1
`;

const ACTIVE_PROGRAMME_SQL = `
  SELECT "id" AS "enrolmentId", "programmeSlug",
         "day1ScheduledFor"::text AS "day1ScheduledFor", "durationDays", "currentDay"
    FROM "programme_enrolment"
   WHERE "userId" = $1 AND "status" = 'active'
`;

// Guarded on status, so a release that lost a race to the user finishing the
// programme changes nothing.
const RELEASE_SQL = `
  UPDATE "programme_enrolment"
     SET "status" = 'abandoned', "abandonedAt" = $2, "updatedAt" = now()
   WHERE "id" = $1 AND "status" = 'active'
  RETURNING "id"
`;

const INSERT_AUDIT_SQL = `
  INSERT INTO "admin_audit_log"
    ("action", "actorId", "actorEmail", "targetEmail", "targetUserId", "reason", "detail")
  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
  RETURNING "id", "createdAt"
`;

const LOG_SQL = `
  SELECT "id", "action", "actorEmail", "reason", "detail", "createdAt"
    FROM "admin_audit_log"
   WHERE "targetUserId" = $1 AND "action" LIKE 'support.%'
   ORDER BY "createdAt" DESC, "id" DESC
   LIMIT 100
`;

export interface SupportLogEntry {
  id: string;
  action: SupportActionKey;
  actorEmail: string;
  reason: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface SupportOverview {
  isFoundingCreator: boolean;
  activeProgramme:
    | (SupportActiveProgramme & { lastDay: string; overdue: boolean })
    | null;
  actions: ({ key: SupportActionKey } & SupportAvailability)[];
  log: SupportLogEntry[];
}

export type SupportActionResult =
  | { status: "applied"; entry: SupportLogEntry }
  | { status: "unchanged"; reason: string };

interface FoundingRow {
  isFoundingCreator: boolean;
  foundingLockedAmount: number | null;
  foundingLockedCurrency: string | null;
  foundingGrantedAt: Date | null;
}

interface LockedState extends SupportState {
  email: string;
  founding: FoundingRow | null;
}

const actionByAudit = new Map(
  Object.entries(supportAuditActions).map(([key, audit]) => [audit, key as SupportActionKey]),
);

const iso = (value: Date | null) => (value ? new Date(value).toISOString() : null);

function toLogEntry(row: {
  id: string | number;
  action: string;
  actorEmail: string;
  reason: string;
  detail: Record<string, unknown>;
  createdAt: Date;
}): SupportLogEntry {
  return {
    id: String(row.id),
    action: actionByAudit.get(row.action)!,
    actorEmail: row.actorEmail,
    reason: row.reason,
    detail: row.detail,
    createdAt: iso(row.createdAt)!,
  };
}

/**
 * The admin's manual support actions on one user, and their audit trail.
 *
 * Every action runs in one transaction that locks the user's row first, so
 * two submissions of the same action queue behind each other: the second
 * re-reads the state the first left, finds the action satisfied, and returns
 * `unchanged` without touching anything or writing a log row. Nothing here
 * emits Content Engine events or writes to Payload.
 */
@Injectable()
export class AdminSupportService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly billing: BillingRepository,
    private readonly billingConfig: BillingConfigService,
  ) {}

  async overview(userId: string, now = new Date()): Promise<SupportOverview> {
    const state = await this.readState(this.dataSource, userId, now, false);
    const rows = returnedRows<Parameters<typeof toLogEntry>[0]>(
      await this.dataSource.query(LOG_SQL, [userId]),
    );
    const programme = state.activeProgramme;

    return {
      isFoundingCreator: state.isFoundingCreator,
      activeProgramme: programme
        ? {
            ...programme,
            lastDay: lastProgrammeDay(programme),
            overdue: isProgrammeOverdue(programme, state.today),
          }
        : null,
      actions: supportActionKeys.map((key) => ({ key, ...supportAvailability(key, state) })),
      log: rows.map(toLogEntry),
    };
  }

  async apply(
    actor: AdminIdentity,
    userId: string,
    input: { action: SupportActionKey; reason: string },
    now = new Date(),
  ): Promise<SupportActionResult> {
    return this.dataSource.transaction(async (manager) => {
      const state = await this.readState(manager, userId, now, true);
      const availability = supportAvailability(input.action, state);

      if (availability.status === "satisfied") {
        return { status: "unchanged", reason: availability.reason } as const;
      }

      if (availability.status === "blocked") {
        throw new ConflictException({
          code: "SUPPORT_ACTION_NOT_APPLICABLE",
          message: availability.reason,
        });
      }

      const detail = await this.perform(manager, userId, input.action, state, now);
      const [row] = returnedRows<{ id: string | number; createdAt: Date }>(
        await manager.query(INSERT_AUDIT_SQL, [
          supportAuditActions[input.action],
          actor.id,
          actor.email,
          state.email.toLowerCase(),
          userId,
          input.reason,
          JSON.stringify(detail),
        ]),
      );

      return {
        status: "applied",
        entry: toLogEntry({
          id: row!.id,
          action: supportAuditActions[input.action],
          actorEmail: actor.email,
          reason: input.reason,
          detail,
          createdAt: row!.createdAt,
        }),
      } as const;
    });
  }

  private async perform(
    manager: SqlQueryable,
    userId: string,
    action: SupportActionKey,
    state: LockedState,
    now: Date,
  ): Promise<Record<string, unknown>> {
    switch (action) {
      case "grant_founding": {
        await this.billing.ensureAccount(userId, manager);
        // A seat is taken when one is free, but the flag is set either way:
        // the cohort cap guards purchases, not support decisions.
        const seatClaimed = await this.billing.claimFoundingSeat(
          this.billingConfig.foundingOffer().cohortCap,
          manager,
        );
        await this.billing.setFoundingFlag(userId, true, manager);

        return {
          before: { isFoundingCreator: false },
          after: { isFoundingCreator: true },
          seatClaimed,
        };
      }

      case "unflag_founding": {
        // Unflagging clears the locked founding price and does not hand the
        // cohort seat back.
        await this.billing.setFoundingFlag(userId, false, manager);
        const founding = state.founding;

        return {
          before: {
            isFoundingCreator: true,
            foundingLockedAmount: founding?.foundingLockedAmount ?? null,
            foundingLockedCurrency: founding?.foundingLockedCurrency ?? null,
            foundingGrantedAt: iso(founding?.foundingGrantedAt ?? null),
          },
          after: { isFoundingCreator: false },
        };
      }

      case "release_programme": {
        const programme = state.activeProgramme!;
        const released = returnedRows<{ id: string }>(
          await manager.query(RELEASE_SQL, [programme.enrolmentId, now]),
        );

        if (released.length === 0) {
          // The row lock makes this unreachable; refusing beats logging a
          // change that did not happen.
          throw new ConflictException({
            code: "SUPPORT_ACTION_NOT_APPLICABLE",
            message: "The programme changed while releasing it. Reload and try again.",
          });
        }

        return {
          programmeSlug: programme.programmeSlug,
          enrolmentId: programme.enrolmentId,
          day1ScheduledFor: programme.day1ScheduledFor,
          lastDay: lastProgrammeDay(programme),
          durationDays: programme.durationDays,
          currentDay: programme.currentDay,
          userToday: state.today,
          before: { status: "active" },
          after: { status: "abandoned" },
        };
      }
    }
  }

  private async readState(
    queryable: SqlQueryable,
    userId: string,
    now: Date,
    lock: boolean,
  ): Promise<LockedState> {
    const forUpdate = lock ? " FOR UPDATE" : "";
    // The user row first: it is the lock every support action on this user
    // queues behind.
    const [user] = returnedRows<{ id: string; email: string; timezone: string | null }>(
      await queryable.query(USER_SQL + (lock ? ` FOR UPDATE OF u` : ""), [userId]),
    );

    if (!user) {
      throw new NotFoundException({ code: "ADMIN_USER_NOT_FOUND", message: "User not found." });
    }

    const [foundingRows, programmeRows] = [
      returnedRows<FoundingRow>(await queryable.query(FOUNDING_SQL + forUpdate, [userId])),
      returnedRows<SupportActiveProgramme>(
        await queryable.query(ACTIVE_PROGRAMME_SQL + forUpdate, [userId]),
      ),
    ];
    const founding = foundingRows[0] ?? null;

    return {
      email: user.email,
      founding,
      isFoundingCreator: founding?.isFoundingCreator === true,
      activeProgramme: programmeRows[0] ?? null,
      today: localDateFor(now, resolveTimezone(user.timezone)),
    };
  }
}
