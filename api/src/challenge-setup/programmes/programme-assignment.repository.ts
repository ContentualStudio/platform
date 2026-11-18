import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ProgrammeAssignmentEntity } from "../entities/programme-assignment.entity";
import type { ProgrammeMatchResult } from "./programme-matching.types";

export interface RecordAssignmentInput {
  userId: string;
  matchedAt: Date;
  result: ProgrammeMatchResult;
  attemptId?: string;
  attemptActor?: string;
  attemptReason?: string;
}

export interface RematchAssignmentInput extends RecordAssignmentInput {
  actor: string;
  reason: string;
  attemptId: string;
  supersededAt: Date;
}

/**
 * Writes to the immutable assignment history.
 *
 * Every method takes the caller's `EntityManager` rather than holding its own
 * repository. The assignment and the completion flag are one fact, and a
 * repository bound to the default connection would write outside the caller's
 * transaction and split it in two.
 */
@Injectable()
export class ProgrammeAssignmentRepository {
  async findActive(
    manager: EntityManager,
    userId: string,
  ): Promise<ProgrammeAssignmentEntity | null> {
    return manager.findOne(ProgrammeAssignmentEntity, {
      where: { userId, active: true },
    });
  }

  async findByAttempt(
    manager: EntityManager,
    userId: string,
    attemptId: string,
  ): Promise<ProgrammeAssignmentEntity | null> {
    return manager.findOne(ProgrammeAssignmentEntity, {
      where: { userId, attemptId },
    });
  }

  async history(
    manager: EntityManager,
    userId: string,
  ): Promise<ProgrammeAssignmentEntity[]> {
    return manager.find(ProgrammeAssignmentEntity, {
      where: { userId },
      order: { matchedAt: "DESC" },
    });
  }

  /**
   * Closes a stale active row when onboarding is being completed again — for
   * example after a dev reset cleared challenge_setup but not assignment history.
   */
  async supersedeActiveIfPresent(
    manager: EntityManager,
    input: {
      userId: string;
      supersededAt: Date;
      actor: string;
      reason: string;
    },
  ): Promise<void> {
    const active = await manager.findOne(ProgrammeAssignmentEntity, {
      where: { userId: input.userId, active: true },
      lock: { mode: "pessimistic_write" },
    });

    if (!active) {
      return;
    }

    const closed = await manager
      .createQueryBuilder()
      .update(ProgrammeAssignmentEntity)
      .set({
        active: false,
        supersededAt: input.supersededAt,
        resetReason: input.reason,
        resetActor: input.actor,
      })
      .where('"id" = :id', { id: active.id })
      .andWhere('"active"')
      .execute();

    if ((closed.affected ?? 0) !== 1) {
      throw new Error("The active assignment changed before it could be superseded.");
    }
  }

  /** Reuses the canonical initial attempt id unless that row already exists. */
  async resolveInitialAttemptId(
    manager: EntityManager,
    userId: string,
  ): Promise<string> {
    const base = `initial:${userId}`;
    const existing = await this.findByAttempt(manager, userId, base);
    return existing ? `${base}:retry:${Date.now()}` : base;
  }

  // Plain insert, deliberately. The partial unique index on active rows is the
  // concurrency guard: a second concurrent completion raises here instead of
  // creating a second assignment, and the caller's transaction rolls back with
  // no completion state written.
  async record(
    manager: EntityManager,
    input: RecordAssignmentInput,
  ): Promise<ProgrammeAssignmentEntity> {
    const { profile, trace } = input.result;

    return manager.save(
      manager.create(ProgrammeAssignmentEntity, {
        userId: input.userId,
        attemptId: input.attemptId ?? `initial:${input.userId}`,
        attemptActor: input.attemptActor ?? "system",
        attemptReason: input.attemptReason ?? "initial assignment",
        programmeKey: trace.selectedProgrammeKey,
        programmeVersionId: trace.selectedProgrammeVersionId,
        setupVersionId: trace.setupVersionId,
        winningRuleId: trace.selectedRuleId,
        fallbackUsed: trace.fallbackUsed,
        multipleRulesQualified: trace.multipleRulesQualified,
        structuredAnswers: profile,
        trace,
        matchedAt: input.matchedAt,
        active: true,
      }),
    );
  }

  /**
   * Closes the active row and records its replacement as one transaction-owned
   * operation. The caller must have already evaluated and validated the new
   * result; this method only handles the history transition and idempotency.
   */
  async rematch(
    manager: EntityManager,
    input: RematchAssignmentInput,
  ): Promise<{ assignment: ProgrammeAssignmentEntity; created: boolean }> {
    const existing = await this.findByAttempt(
      manager,
      input.userId,
      input.attemptId,
    );

    if (existing) {
      return { assignment: existing, created: false };
    }

    const active = await manager.findOne(ProgrammeAssignmentEntity, {
      where: { userId: input.userId, active: true },
      lock: { mode: "pessimistic_write" },
    });

    if (!active) {
      throw new Error("Cannot rematch a user without an active assignment.");
    }

    const closed = await manager
      .createQueryBuilder()
      .update(ProgrammeAssignmentEntity)
      .set({
        active: false,
        supersededAt: input.supersededAt,
        resetReason: input.reason,
        resetActor: input.actor,
      })
      .where('"id" = :id', { id: active.id })
      .andWhere('"active"')
      .execute();

    if ((closed.affected ?? 0) !== 1) {
      throw new Error("The active assignment changed before it could be rematched.");
    }

    const assignment = await this.record(manager, {
      ...input,
      attemptActor: input.actor,
      attemptReason: input.reason,
    });

    return { assignment, created: true };
  }

}
