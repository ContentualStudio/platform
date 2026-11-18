import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import { ContentEventBatch, dispatchAfterCommit } from "../content-engine/event-batch";
import { ContentEventDispatcher } from "../content-engine/event-dispatcher";
import { ContentEventEmitter } from "../content-engine/event-emitter";
import { contentEventIds } from "../content-engine/event-ids";
import { returnedRows } from "../content-engine/returned-rows";
import { ledgerKeyFor } from "../programme-enrolment/ledger-key";
import { ProgrammeEnrolmentService } from "../programme-enrolment/programme-enrolment.service";

// The programme.completed emit gate and the programme.count_reached ordinal
// mint in one statement.
const INSERT_COMPLETION_SQL = `
  INSERT INTO "programme_completion"
    ("assignmentId", "userId", "programmeId", "programmeVersionId", "completionOrdinal")
  SELECT $2, $1, $3, $4, COALESCE(MAX("completionOrdinal"), 0) + 1
  FROM "programme_completion"
  WHERE "userId" = $1
  ON CONFLICT ("assignmentId") DO NOTHING
  RETURNING "completionOrdinal"
`;

const UPDATE_COMPLETED_AT_SQL = `
  UPDATE "challenge_setup" SET "programmeCompletedAt" = now() WHERE "userId" = $1
`;

export interface CompleteProgrammeResult {
  readonly recorded: boolean;
}

@Injectable()
export class ProgressionService {
  private readonly logger = new Logger(ProgressionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly eventEmitter: ContentEventEmitter,
    private readonly eventDispatcher: ContentEventDispatcher,
    private readonly enrolments: ProgrammeEnrolmentService,
  ) {}

  async completeProgramme(
    user: AuthenticatedUser,
  ): Promise<CompleteProgrammeResult> {
    const batch = new ContentEventBatch();
    const recorded = await this.dataSource.transaction((manager) =>
      this.completeProgrammeInTransaction(manager, batch, user.id),
    );

    await dispatchAfterCommit(this.eventDispatcher, this.logger, batch.eventIds);

    return { recorded };
  }

  // Public with this exact signature so a future auto-trigger (once the task
  // set backing week/programme progress is a real mirror rather than a mock)
  // becomes a second caller of this method, never a second emit site.
  async completeProgrammeInTransaction(
    manager: EntityManager,
    batch: ContentEventBatch,
    userId: string,
  ): Promise<boolean> {
    // Completing the journey under way, not the questionnaire's assignment:
    // from the second programme onward they are different programmes, and it
    // is the running one that finishes. The row lock is what makes the minted
    // completion ordinal exact under concurrency.
    const enrolment = await this.enrolments.findActiveForUpdate(
      manager,
      userId,
    );

    if (!enrolment) {
      throw new NotFoundException({
        code: "NO_ACTIVE_PROGRAMME",
        message: "No programme is currently under way.",
      });
    }

    const programmeId = enrolment.programmeSlug;
    const assignmentId = ledgerKeyFor(enrolment);

    const [inserted] = returnedRows<{ completionOrdinal: number }>(
      await manager.query(INSERT_COMPLETION_SQL, [
        userId,
        assignmentId,
        programmeId,
        enrolment.programmeVersionId ?? null,
      ]),
    );

    if (!inserted) {
      return false;
    }

    // Bookkeeping only, written after the gate. Kept on the setup row because
    // `programmeCompleted` in the setup status still reads it; it records
    // "this user has finished a programme", not which one.
    await manager.query(UPDATE_COMPLETED_AT_SQL, [userId]);
    await this.enrolments.completeActiveInTransaction(manager, userId);

    const completedEvent = await this.eventEmitter.emit(manager, {
      eventId: contentEventIds.programmeCompleted({
        userId,
        programmeId,
        assignmentId,
      }),
      eventName: eventNameTokens.programmeCompleted,
      payload: {
        userId,
        programmeId,
        ...(enrolment.programmeVersionId
          ? { programmeVersionId: enrolment.programmeVersionId }
          : {}),
      },
    });
    batch.add(completedEvent.id);

    const countEvent = await this.eventEmitter.emit(manager, {
      eventId: contentEventIds.programmeCountReached({
        userId,
        count: inserted.completionOrdinal,
      }),
      eventName: eventNameTokens.programmeCountReached,
      payload: { userId, count: inserted.completionOrdinal },
    });
    batch.add(countEvent.id);

    return true;
  }
}
