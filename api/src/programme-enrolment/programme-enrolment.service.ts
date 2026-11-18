import { Inject, Injectable, Logger } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import {
  PROGRAMME_CONTENT_READER,
  type ProgrammeContentReader,
} from "../challenge-setup/programmes/programme-content.repository";
import type { ProgrammeTask } from "../challenge-setup/programmes/programme-task-content";
import { returnedRows } from "../content-engine/returned-rows";
import type { ProgrammeEnrolmentEntity } from "./entities/programme-enrolment.entity";

export interface StartEnrolmentInput {
  readonly userId: string;
  readonly programmeSlug: string;
  readonly programmeVersionId: string | null;
  readonly assignmentId: string | null;
  readonly startedAt: Date;
  readonly day1ScheduledFor: string;
  readonly durationDays: number;
}

const SELECT_ACTIVE_FOR_UPDATE_SQL = `
  SELECT "id", "userId", "programmeSlug", "programmeVersionId", "assignmentId",
         "status", "startedAt", "currentDay", "lastServedDay", "durationDays",
         "day1ScheduledFor"::text AS "day1ScheduledFor",
         "completedAt", "abandonedAt"
  FROM "programme_enrolment"
  WHERE "userId" = $1 AND "status" = 'active'
  FOR UPDATE
`;

const SELECT_SERVED_FOR_DATE_SQL = `
  SELECT "programmeDay", "taskId", "outcome"
  FROM "programme_day_serve"
  WHERE "enrolmentId" = $1 AND "localDate" = $2::date AND "outcome" = 'served'
  ORDER BY "programmeDay" DESC
  LIMIT 1
`;

const INSERT_ENROLMENT_SQL = `
  INSERT INTO "programme_enrolment"
    ("userId", "programmeSlug", "programmeVersionId", "assignmentId",
     "status", "startedAt", "currentDay", "durationDays", "day1ScheduledFor")
  VALUES ($1, $2, $3, $4, 'active', $5, 1, $6, $7::date)
  RETURNING "id"
`;

const ABANDON_ACTIVE_SQL = `
  UPDATE "programme_enrolment"
     SET "status" = 'abandoned',
         "abandonedAt" = $2,
         "updatedAt" = now()
   WHERE "userId" = $1 AND "status" = 'active'
`;

const COMPLETE_ACTIVE_SQL = `
  UPDATE "programme_enrolment"
     SET "status" = 'completed',
         "completedAt" = COALESCE("completedAt", $2),
         "updatedAt" = now()
   WHERE "userId" = $1 AND "status" = 'active'
`;

const INSERT_SERVE_SQL = `
  INSERT INTO "programme_day_serve"
    ("enrolmentId", "userId", "programmeSlug", "programmeDay",
     "localDate", "taskId", "outcome")
  VALUES ($1, $2, $3, $4, $5::date, $6, $7)
  ON CONFLICT ("enrolmentId", "programmeDay") DO NOTHING
  RETURNING "id"
`;

const ADVANCE_POINTER_SQL = `
  UPDATE "programme_enrolment"
     SET "currentDay" = $2,
         "lastServedDay" = $3,
         "updatedAt" = now()
   WHERE "id" = $1 AND "status" = 'active' AND "currentDay" = $4
`;

const COMPLETE_ENROLMENT_BY_ID_SQL = `
  UPDATE "programme_enrolment"
     SET "status" = 'completed',
         "completedAt" = $2,
         "updatedAt" = now()
   WHERE "id" = $1 AND "status" = 'active'
`;

const RECORD_GAP_SQL = `
  INSERT INTO "programme_task_mirror_gap"
    ("programmeSlug", "programmeDay", "enrolmentId", "userId", "localDate")
  VALUES ($1, $2, $3, $4, $5::date)
  ON CONFLICT ("programmeSlug", "programmeDay") DO NOTHING
`;

const ENROLMENT_COLUMNS = `
  "id", "userId", "programmeSlug", "programmeVersionId", "assignmentId",
  "status", "startedAt", "currentDay", "lastServedDay", "durationDays",
  "day1ScheduledFor"::text AS "day1ScheduledFor",
  "completedAt", "abandonedAt"
`;

@Injectable()
export class ProgrammeEnrolmentService {
  private readonly logger = new Logger(ProgrammeEnrolmentService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(PROGRAMME_CONTENT_READER)
    private readonly contentReader: ProgrammeContentReader,
  ) {}

  /**
   * Opens an active enrolment at day 1. Callers must close any prior active
   * enrolment first — the partial unique index enforces that rule.
   */
  async startInTransaction(
    manager: EntityManager,
    input: StartEnrolmentInput,
  ): Promise<{ id: string; created: boolean }> {
    if (input.durationDays < 1) {
      throw new Error("Programme duration must be at least one day.");
    }

    const existing = await this.findActiveForUpdate(manager, input.userId);
    if (existing) {
      return { id: existing.id, created: false };
    }

    const [inserted] = returnedRows<{ id: string }>(
      await manager.query(INSERT_ENROLMENT_SQL, [
        input.userId,
        input.programmeSlug,
        input.programmeVersionId,
        input.assignmentId,
        input.startedAt,
        input.durationDays,
        input.day1ScheduledFor,
      ]),
    );

    if (!inserted) {
      throw new Error("Failed to create programme enrolment.");
    }

    return { id: inserted.id, created: true };
  }

  async abandonActiveInTransaction(
    manager: EntityManager,
    userId: string,
    abandonedAt = new Date(),
  ): Promise<void> {
    await manager.query(ABANDON_ACTIVE_SQL, [userId, abandonedAt]);
  }

  async completeActiveInTransaction(
    manager: EntityManager,
    userId: string,
    completedAt = new Date(),
  ): Promise<void> {
    await manager.query(COMPLETE_ACTIVE_SQL, [userId, completedAt]);
  }

  async findActiveForUser(
    userId: string,
    manager: EntityManager | DataSource = this.dataSource,
  ): Promise<ProgrammeEnrolmentEntity | null> {
    const [row] = (await manager.query(
      `SELECT ${ENROLMENT_COLUMNS}
         FROM "programme_enrolment"
        WHERE "userId" = $1 AND "status" = 'active'
        LIMIT 1`,
      [userId],
    )) as ProgrammeEnrolmentEntity[];

    return row ?? null;
  }

  /** Every journey this user has started, newest first, whatever its status. */
  async listForUser(userId: string): Promise<ProgrammeEnrolmentEntity[]> {
    return (await this.dataSource.query(
      `SELECT ${ENROLMENT_COLUMNS}
         FROM "programme_enrolment"
        WHERE "userId" = $1
        ORDER BY "startedAt" DESC, "id" DESC`,
      [userId],
    )) as ProgrammeEnrolmentEntity[];
  }

  /**
   * Serves the current programme day for one user on their local morning.
   *
   * Forward-only and idempotent: the serve ledger unique key makes a second
   * attempt for the same day a no-op. Missing mirror rows advance the pointer
   * and record a gap for backfill. Gaps are skipped in the same tick until a
   * real task is served or the programme ends.
   */
  async serveLocalMorning(
    userId: string,
    localDate: string,
  ): Promise<"succeeded" | "skipped"> {
    return this.dataSource.transaction((manager) =>
      this.serveLocalMorningInTransaction(manager, userId, localDate),
    );
  }

  private async serveLocalMorningInTransaction(
    manager: EntityManager,
    userId: string,
    localDate: string,
  ): Promise<"succeeded" | "skipped"> {
    const enrolment = await this.findActiveForUpdate(manager, userId);

    if (!enrolment) {
      return "skipped";
    }

    // First task is on the Day 1 tick, never retroactive to earlier mornings.
    if (localDate < enrolment.day1ScheduledFor) {
      return "skipped";
    }

    // Idempotent mornings: a retry of an already-served local date reuses the
    // existing row instead of advancing to the next programme day. The serve
    // rows and the day pointer commit in this same transaction, so a committed
    // row means the morning was fully served. Without this, a retried morning
    // would serve tomorrow's task today and notify for the wrong day. This
    // runs after the row lock above, so a concurrent run serializes here and
    // observes the first run's committed rows.
    const [servedToday] = (await manager.query(SELECT_SERVED_FOR_DATE_SQL, [
      enrolment.id,
      localDate,
    ])) as { programmeDay: number; taskId: string | null; outcome: string }[];

    if (servedToday) {
      if (enrolment.currentDay <= servedToday.programmeDay) {
        // Pointer repair for a run whose ledger committed ahead of it; the
        // conditional advance is a no-op when already caught up.
        await this.advancePointer(manager, enrolment, servedToday.programmeDay);
      }

      return "succeeded";
    }

    let servedATask = false;

    while (enrolment.currentDay <= enrolment.durationDays) {
      const day = enrolment.currentDay;
      const tasks = await this.tasksForDay(manager, enrolment, day);

      if (tasks.length === 0) {
        await this.recordGap(manager, enrolment, day, localDate);
        const recorded = await this.recordServe(manager, {
          enrolment,
          programmeDay: day,
          localDate,
          taskId: null,
          outcome: "gap_skipped",
        });

        if (recorded) {
          await this.advancePointer(manager, enrolment, day);
        } else if (enrolment.currentDay === day) {
          // Ledger already had this day; catch the pointer up.
          await this.advancePointer(manager, enrolment, day);
        }

        continue;
      }

      const recorded = await this.recordServe(manager, {
        enrolment,
        programmeDay: day,
        localDate,
        taskId: tasks[0]?.id ?? null,
        outcome: "served",
      });

      if (recorded) {
        await this.advancePointer(manager, enrolment, day);
        servedATask = true;
      } else if (enrolment.currentDay === day) {
        await this.advancePointer(manager, enrolment, day);
      }

      // One real task-day per morning; gaps above may have been skipped first.
      break;
    }

    if (enrolment.currentDay > enrolment.durationDays) {
      // Last day has been served (or gap-skipped through the end). Leave the
      // active delivery loop; task completion still flows through progression.
      await manager.query(COMPLETE_ENROLMENT_BY_ID_SQL, [
        enrolment.id,
        new Date(),
      ]);
      enrolment.status = "completed";
    }

    if (!servedATask && enrolment.lastServedDay === null && enrolment.status === "active") {
      // Nothing new to do this morning (already caught up, or only future days).
      return "succeeded";
    }

    return "succeeded";
  }

  /**
   * The active enrolment, row-locked for the caller's transaction.
   *
   * Public because completion needs the same lock: the completion ordinal is
   * minted against this row, and an unlocked read would let two concurrent
   * completions mint the same number.
   */
  async findActiveForUpdate(
    manager: EntityManager,
    userId: string,
  ): Promise<ProgrammeEnrolmentEntity | null> {
    const [row] = (await manager.query(SELECT_ACTIVE_FOR_UPDATE_SQL, [
      userId,
    ])) as ProgrammeEnrolmentEntity[];

    return row ?? null;
  }

  private async tasksForDay(
    manager: EntityManager,
    enrolment: ProgrammeEnrolmentEntity,
    day: number,
  ): Promise<ProgrammeTask[]> {
    if (enrolment.programmeVersionId) {
      return this.contentReader.tasksForProgrammeDayVersion(
        enrolment.programmeVersionId,
        day,
        manager,
      );
    }

    return this.contentReader.tasksForProgrammeDay(
      enrolment.programmeSlug,
      day,
      manager,
    );
  }

  private async recordServe(
    manager: EntityManager,
    input: {
      enrolment: ProgrammeEnrolmentEntity;
      programmeDay: number;
      localDate: string;
      taskId: string | null;
      outcome: "served" | "gap_skipped";
    },
  ): Promise<boolean> {
    const [inserted] = returnedRows<{ id: string }>(
      await manager.query(INSERT_SERVE_SQL, [
        input.enrolment.id,
        input.enrolment.userId,
        input.enrolment.programmeSlug,
        input.programmeDay,
        input.localDate,
        input.taskId,
        input.outcome,
      ]),
    );

    return Boolean(inserted);
  }

  private async advancePointer(
    manager: EntityManager,
    enrolment: ProgrammeEnrolmentEntity,
    servedDay: number,
  ): Promise<void> {
    const nextDay = servedDay + 1;
    await manager.query(ADVANCE_POINTER_SQL, [
      enrolment.id,
      nextDay,
      servedDay,
      servedDay,
    ]);
    enrolment.currentDay = nextDay;
    enrolment.lastServedDay = servedDay;
  }

  private async recordGap(
    manager: EntityManager,
    enrolment: ProgrammeEnrolmentEntity,
    programmeDay: number,
    localDate: string,
  ): Promise<void> {
    await manager.query(RECORD_GAP_SQL, [
      enrolment.programmeSlug,
      programmeDay,
      enrolment.id,
      enrolment.userId,
      localDate,
    ]);
    this.logger.warn(
      `Programme mirror gap: ${enrolment.programmeSlug} day ${programmeDay}`,
    );
  }
}
