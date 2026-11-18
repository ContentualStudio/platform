import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import {
  PROGRAMME_CONTENT_READER,
  type ProgrammeContentReader,
} from "../challenge-setup/programmes/programme-content.repository";
import type { ProgrammeTask } from "../challenge-setup/programmes/programme-task-content";
import { localDateFor } from "../common/timezone";
import { ContentEventBatch, dispatchAfterCommit } from "../content-engine/event-batch";
import { ContentEventDispatcher } from "../content-engine/event-dispatcher";
import { ContentEventEmitter } from "../content-engine/event-emitter";
import { contentEventIds } from "../content-engine/event-ids";
import { returnedRows } from "../content-engine/returned-rows";
import { GamificationService } from "../gamification/gamification.service";
import { ledgerKeyFor } from "../programme-enrolment/ledger-key";
import { ProgrammeEnrolmentService } from "../programme-enrolment/programme-enrolment.service";
import { UserProfileEntity } from "../profile/entities/user-profile.entity";

// The idempotency guarantee and the task.completed/task.skipped emit gate in
// one: a task is completable (or skippable) once per user-local day.
const INSERT_TASK_PROGRESS_SQL = `
  INSERT INTO "programme_task_progress"
    ("assignmentId", "userId", "programmeId", "taskId", "outcome", "weekIndex", "contentType", "localDate")
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date)
  ON CONFLICT ("assignmentId", "taskId", "outcome", "localDate") DO NOTHING
  RETURNING "id", "recordedAt"
`;

// The retry path: a second complete/skip of an already-resolved day resolves
// to the event already on record rather than writing a new one.
const SELECT_TASK_PROGRESS_SQL = `
  SELECT "outcome", "localDate"::text AS "localDate", "recordedAt"
  FROM "programme_task_progress"
  WHERE "assignmentId" = $1 AND "taskId" = $2 AND "outcome" = $3 AND "localDate" = $4::date
  LIMIT 1
`;

// Everything this assignment has resolved, so the card can open in its
// completed/skipped state instead of trusting browser storage.
const LIST_TASK_PROGRESS_SQL = `
  SELECT "taskId", "outcome", "localDate"::text AS "localDate", "recordedAt"
  FROM "programme_task_progress"
  WHERE "assignmentId" = $1
  ORDER BY "recordedAt"
`;

// DISTINCT matters: a task redone on a later day must not double-count
// towards the week's completion.
const COUNT_WEEK_COMPLETIONS_SQL = `
  SELECT COUNT(DISTINCT "taskId") AS "count"
  FROM "programme_task_progress"
  WHERE "assignmentId" = $1 AND "weekIndex" = $2 AND "outcome" = 'completed'
`;

// The week.completed emit gate — stops two concurrent completions of a
// week's last two tasks from both emitting.
const INSERT_WEEK_COMPLETION_SQL = `
  INSERT INTO "programme_week_completion" ("assignmentId", "userId", "programmeId", "weekIndex")
  VALUES ($1, $2, $3, $4)
  ON CONFLICT ("assignmentId", "weekIndex") DO NOTHING
  RETURNING "id"
`;

const COUNT_LIFETIME_COMPLETIONS_SQL = `
  SELECT COUNT(DISTINCT ("programmeId", "taskId")) AS "count"
  FROM "programme_task_progress"
  WHERE "userId" = $1 AND "outcome" = 'completed'
`;

// Run after the skip insert so the row just written counts. Skips reset at
// the most recent completion in this programme, or count from the beginning
// if there has never been one.
const COUNT_SKIPS_SINCE_LAST_COMPLETION_SQL = `
  SELECT COUNT(*) AS "count"
  FROM "programme_task_progress"
  WHERE "assignmentId" = $1 AND "outcome" = 'skipped'
    AND "recordedAt" > COALESCE(
      (SELECT MAX("recordedAt") FROM "programme_task_progress"
         WHERE "assignmentId" = $1 AND "outcome" = 'completed'),
      '-infinity'
    )
`;

export type TaskOutcome = "completed" | "skipped";

export interface TaskProgressRecord {
  readonly taskId: string;
  readonly outcome: TaskOutcome;
  readonly localDate: string;
  readonly recordedAt: string;
}

export interface RecordOutcomeResult {
  readonly recorded: boolean;
  readonly progress: TaskProgressRecord;
}

@Injectable()
export class ProgrammeTaskService {
  private readonly logger = new Logger(ProgrammeTaskService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly eventEmitter: ContentEventEmitter,
    private readonly eventDispatcher: ContentEventDispatcher,
    private readonly gamification: GamificationService,
    private readonly enrolments: ProgrammeEnrolmentService,
    @Inject(PROGRAMME_CONTENT_READER)
    private readonly contentReader: ProgrammeContentReader,
  ) {}

  async listTasks(user: AuthenticatedUser): Promise<ProgrammeTask[]> {
    return this.dataSource.transaction((manager) =>
      this.listAssignedTasks(manager, user),
    );
  }

  /** Outcomes already on record for the user's active assignment. */
  async listProgress(user: AuthenticatedUser): Promise<TaskProgressRecord[]> {
    return this.dataSource.transaction(async (manager) => {
      const assigned = await this.currentProgramme(manager, user);
      const rows = (await manager.query(LIST_TASK_PROGRESS_SQL, [
        assigned.assignmentId,
      ])) as {
        taskId: string;
        outcome: TaskOutcome;
        localDate: string;
        recordedAt: Date;
      }[];

      return rows.map((row) => ({
        taskId: row.taskId,
        outcome: row.outcome,
        localDate: row.localDate,
        recordedAt: new Date(row.recordedAt).toISOString(),
      }));
    });
  }

  async completeTask(
    user: AuthenticatedUser,
    taskId: string,
  ): Promise<RecordOutcomeResult> {
    const batch = new ContentEventBatch();
    const result = await this.dataSource.transaction((manager) =>
      this.recordCompletion(manager, batch, user, taskId),
    );

    await dispatchAfterCommit(this.eventDispatcher, this.logger, batch.eventIds);

    return result;
  }

  async skipTask(
    user: AuthenticatedUser,
    taskId: string,
  ): Promise<RecordOutcomeResult> {
    const batch = new ContentEventBatch();
    const result = await this.dataSource.transaction((manager) =>
      this.recordSkip(manager, batch, user, taskId),
    );

    await dispatchAfterCommit(this.eventDispatcher, this.logger, batch.eventIds);

    return result;
  }

  private async loadContext(
    manager: EntityManager,
    user: AuthenticatedUser,
    taskId: string,
  ): Promise<{
    assignmentId: string;
    programmeId: string;
    programmeVersionId?: string;
    task: ProgrammeTask;
    localDate: string;
  }> {
    const assigned = await this.currentProgramme(manager, user);

    // A journey started from the eligible list has no pinned version and
    // reads the programme's published content by slug.
    const task = assigned.programmeVersionId
      ? await this.contentReader.findProgrammeTaskForVersion(
          assigned.programmeVersionId,
          taskId,
          manager,
        )
      : await this.contentReader.findProgrammeTask(
          assigned.programmeId,
          taskId,
          manager,
        );

    if (!task) {
      throw new NotFoundException({
        code: "UNKNOWN_TASK",
        message: "That task does not belong to the assigned programme.",
      });
    }

    if (!task.contentType?.trim()) {
      throw new NotFoundException({
        code: "PROGRAMME_CONTENT_INVALID",
        message: "The task has no authored content type.",
      });
    }

    const profile = await manager.findOneBy(UserProfileEntity, {
      userId: user.id,
    });
    const localDate = localDateFor(new Date(), profile?.timezone ?? "UTC");

    return {
      assignmentId: assigned.assignmentId,
      programmeId: assigned.programmeId,
      programmeVersionId: assigned.programmeVersionId,
      task,
      localDate,
    };
  }

  private async listAssignedTasks(
    manager: EntityManager,
    user: AuthenticatedUser,
  ): Promise<ProgrammeTask[]> {
    const assigned = await this.currentProgramme(manager, user);

    return assigned.programmeVersionId
      ? this.contentReader.tasksForProgrammeVersion(
          assigned.programmeVersionId,
          manager,
        )
      : this.contentReader.tasksForProgramme(assigned.programmeId, manager);
  }

  /**
   * The journey today's task belongs to.
   *
   * Resolves from the active enrolment, not from the questionnaire's
   * assignment: a user on their second programme must get that programme's
   * tasks, and a user who has finished one must get none at all rather than
   * their old programme's. For a first programme the two agree.
   *
   * Deliberately does not load the programme's content. Every caller that
   * needs content loads it immediately afterwards, and the snapshot is the
   * whole programme — tasks, modules and lessons — parsed out of jsonb. A
   * check here would read all of that and throw it away, so the readers that
   * do want it are left to fail closed on their own missing content.
   */
  private async currentProgramme(
    manager: EntityManager,
    user: AuthenticatedUser,
  ): Promise<{
    assignmentId: string;
    programmeId: string;
    programmeVersionId?: string;
  }> {
    const enrolment = await this.enrolments.findActiveForUser(user.id, manager);

    if (!enrolment) {
      throw new NotFoundException({
        code: "NO_ACTIVE_PROGRAMME",
        message: "No programme is currently under way.",
      });
    }

    return {
      assignmentId: ledgerKeyFor(enrolment),
      programmeId: enrolment.programmeSlug,
      programmeVersionId: enrolment.programmeVersionId ?? undefined,
    };
  }

  // The idempotency gate shared by completion and skip — identical insert,
  // differing only by outcome. A losing insert reads back the event already
  // on record so a retry resolves to it instead of reporting a fresh write.
  private async insertProgress(
    manager: EntityManager,
    user: AuthenticatedUser,
    assignmentId: string,
    programmeId: string,
    task: ProgrammeTask,
    outcome: TaskOutcome,
    localDate: string,
  ): Promise<{ recorded: boolean; progress: TaskProgressRecord }> {
    const [inserted] = returnedRows<{ id: string; recordedAt: Date }>(
      await manager.query(INSERT_TASK_PROGRESS_SQL, [
        assignmentId,
        user.id,
        programmeId,
        task.id,
        outcome,
        task.weekIndex,
        task.contentType,
        localDate,
      ]),
    );

    if (inserted) {
      return {
        recorded: true,
        progress: {
          taskId: task.id,
          outcome,
          localDate,
          recordedAt: new Date(inserted.recordedAt).toISOString(),
        },
      };
    }

    const [existing] = (await manager.query(SELECT_TASK_PROGRESS_SQL, [
      assignmentId,
      task.id,
      outcome,
      localDate,
    ])) as { outcome: TaskOutcome; localDate: string; recordedAt: Date }[];

    return {
      recorded: false,
      progress: {
        taskId: task.id,
        outcome,
        localDate,
        recordedAt: new Date(existing?.recordedAt ?? Date.now()).toISOString(),
      },
    };
  }

  private async recordCompletion(
    manager: EntityManager,
    batch: ContentEventBatch,
    user: AuthenticatedUser,
    taskId: string,
  ): Promise<RecordOutcomeResult> {
    const { assignmentId, programmeId, programmeVersionId, task, localDate } = await this.loadContext(
      manager,
      user,
      taskId,
    );

    const outcome = await this.insertProgress(
      manager,
      user,
      assignmentId,
      programmeId,
      task,
      "completed",
      localDate,
    );

    if (!outcome.recorded) {
      return outcome;
    }

    const completedEvent = await this.eventEmitter.emit(manager, {
      eventId: contentEventIds.taskCompleted({
        userId: user.id,
        assignmentId,
        programmeId,
        taskId: task.id,
        localDate,
      }),
      eventName: eventNameTokens.taskCompleted,
      payload: {
        userId: user.id,
        programmeId,
        taskId: task.id,
        contentType: task.contentType,
        ...(programmeVersionId ? { programmeVersionId } : {}),
      },
    });
    batch.add(completedEvent.id);

    await this.maybeCompleteWeek(
      manager,
      batch,
      user,
      assignmentId,
      programmeId,
      programmeVersionId,
      task.weekIndex,
    );

    const [{ count: lifetimeCompletions }] = (await manager.query(
      COUNT_LIFETIME_COMPLETIONS_SQL,
      [user.id],
    )) as { count: string }[];

    await this.gamification.recordTaskCompletion(manager, batch, {
      userId: user.id,
      localDate,
      lifetimeTaskCompletions: Number(lifetimeCompletions),
    });

    return outcome;
  }

  private async maybeCompleteWeek(
    manager: EntityManager,
    batch: ContentEventBatch,
    user: AuthenticatedUser,
    assignmentId: string,
    programmeId: string,
    programmeVersionId: string | undefined,
    weekIndex: number,
  ): Promise<void> {
    const weekTasks = programmeVersionId
      ? await this.contentReader.tasksForWeekVersion(
          programmeVersionId,
          weekIndex,
          manager,
        )
      : await this.contentReader.tasksForWeek(programmeId, weekIndex, manager);

    if (weekTasks.length === 0) {
      return;
    }

    const [{ count: weekCompletions }] = (await manager.query(
      COUNT_WEEK_COMPLETIONS_SQL,
      [assignmentId, weekIndex],
    )) as { count: string }[];

    if (Number(weekCompletions) < weekTasks.length) {
      return;
    }

    const [weekRow] = returnedRows<{ id: string }>(
      await manager.query(INSERT_WEEK_COMPLETION_SQL, [
        assignmentId,
        user.id,
        programmeId,
        weekIndex,
      ]),
    );

    if (!weekRow) {
      return;
    }

    const weekEvent = await this.eventEmitter.emit(manager, {
      eventId: contentEventIds.weekCompleted({
        userId: user.id,
        assignmentId,
        programmeId,
        weekIndex,
      }),
      eventName: eventNameTokens.weekCompleted,
      payload: { userId: user.id, programmeId, weekIndex },
    });
    batch.add(weekEvent.id);
  }

  private async recordSkip(
    manager: EntityManager,
    batch: ContentEventBatch,
    user: AuthenticatedUser,
    taskId: string,
  ): Promise<RecordOutcomeResult> {
    const { assignmentId, programmeId, programmeVersionId, task, localDate } = await this.loadContext(
      manager,
      user,
      taskId,
    );

    const outcome = await this.insertProgress(
      manager,
      user,
      assignmentId,
      programmeId,
      task,
      "skipped",
      localDate,
    );

    if (!outcome.recorded) {
      return outcome;
    }

    // Run after the insert so this skip is counted.
    const [{ count: consecutiveSkipCount }] = (await manager.query(
      COUNT_SKIPS_SINCE_LAST_COMPLETION_SQL,
      [assignmentId],
    )) as { count: string }[];

    const skippedEvent = await this.eventEmitter.emit(manager, {
      eventId: contentEventIds.taskSkipped({
        userId: user.id,
        assignmentId,
        programmeId,
        taskId: task.id,
        localDate,
      }),
      eventName: eventNameTokens.taskSkipped,
      payload: {
        userId: user.id,
        programmeId,
        taskId: task.id,
        consecutiveSkipCount: Number(consecutiveSkipCount),
        ...(programmeVersionId ? { programmeVersionId } : {}),
      },
    });
    batch.add(skippedEvent.id);

    return outcome;
  }
}
