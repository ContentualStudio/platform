import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { effectTypeTokens } from "@contentual/content-engine-vocabulary";
import type { EffectDispatchInput } from "../effect-dispatcher.port";
import { returnedRows } from "../returned-rows";
import { NotificationsService } from "../../notifications/notifications.service";
import { productEventTokens } from "../../observability/product-events";
import {
  assertTargetExists,
  type ContentEngineEffectHandler,
  type EffectWriteOutcome,
} from "./effect-handler";
import {
  badgeTarget,
  callTypeTarget,
  inAppNotificationParameters,
  programmeTarget,
} from "./effect-parameters";

// Every effect row carries the rule and event that produced it, so an
// unexpected suggestion or badge can be traced back to its cause.
function provenance(input: EffectDispatchInput) {
  return [input.rule.id, input.event.id];
}

/**
 * Records that a programme is suggested for this user.
 *
 * Suggestions accumulate rather than replace. Picking one winner among
 * competing suggestions is Progression's decision, and it cannot make it if
 * earlier suggestions were overwritten.
 */
@Injectable()
export class SuggestProgrammeHandler implements ContentEngineEffectHandler {
  async write(
    manager: EntityManager,
    input: EffectDispatchInput,
  ): Promise<void> {
    const programmeId = programmeTarget(
      input.rule.effectParams,
      effectTypeTokens.suggestProgramme,
    );

    if (input.event.eventName !== "programme.completed") {
      await assertTargetExists(manager, {
        table: "programme",
        sourceDocumentId: programmeId,
        effectType: effectTypeTokens.suggestProgramme,
        requireActive: false,
      });
    }
    // Completion resolution skips missing/ineligible targets. Recording a
    // candidate must not keep the entire event retrying for a retired target.
    await manager.query(
      `INSERT INTO "engine_programme_suggestion"
         ("userId", "programmeId", "ruleId", "eventId", "priority")
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.event.userId,
        programmeId,
        ...provenance(input),
        input.rule.priority ?? 100,
      ],
    );
  }
}

/**
 * Marks a programme available to this user.
 *
 * Unlocking grants access; it never enrols. Starting a programme stays an
 * explicit user action, so the engine cannot silently move somebody onto
 * different content.
 */
@Injectable()
export class UnlockProgrammeHandler implements ContentEngineEffectHandler {
  async write(
    manager: EntityManager,
    input: EffectDispatchInput,
  ): Promise<void> {
    const programmeId = programmeTarget(
      input.rule.effectParams,
      effectTypeTokens.unlockProgramme,
    );

    await assertTargetExists(manager, {
      table: "programme",
      sourceDocumentId: programmeId,
      effectType: effectTypeTokens.unlockProgramme,
      requireActive: false,
    });

    await manager.query(
      `INSERT INTO "engine_programme_unlock"
         ("userId", "programmeId", "ruleId", "eventId")
       VALUES ($1, $2, $3, $4)`,
      [input.event.userId, programmeId, ...provenance(input)],
    );
  }
}

/** Records a coaching-call prompt of the rule's call type for this user. */
@Injectable()
export class PromptCallHandler implements ContentEngineEffectHandler {
  async write(
    manager: EntityManager,
    input: EffectDispatchInput,
  ): Promise<void> {
    const callTypeId = callTypeTarget(
      input.rule.effectParams,
      effectTypeTokens.promptCall,
    );

    await assertTargetExists(manager, {
      table: "engine_call_types",
      sourceDocumentId: callTypeId,
      effectType: effectTypeTokens.promptCall,
      requireActive: true,
    });

    await manager.query(
      `INSERT INTO "engine_call_prompt"
         ("userId", "callTypeId", "ruleId", "eventId")
       VALUES ($1, $2, $3, $4)`,
      [input.event.userId, callTypeId, ...provenance(input)],
    );
  }
}

/**
 * Adds a badge to the user's achievements and queues its celebration.
 *
 * The achievement insert is idempotent on (user, badge). The firing ledger
 * already stops one rule firing twice, but it keys on the rule — it cannot see
 * that two *different* rules award the same badge, which is exactly the case
 * this guards.
 *
 * Awarding never fires a celebration directly. The celebration is governed by
 * the cooldown queue so no user sees two within 24 hours; this only enqueues.
 */
@Injectable()
export class AwardBadgeHandler implements ContentEngineEffectHandler {
  async write(
    manager: EntityManager,
    input: EffectDispatchInput,
  ): Promise<EffectWriteOutcome | void> {
    const badgeId = badgeTarget(
      input.rule.effectParams,
      effectTypeTokens.awardBadge,
    );

    await assertTargetExists(manager, {
      table: "engine_badges",
      sourceDocumentId: badgeId,
      effectType: effectTypeTokens.awardBadge,
      requireActive: true,
    });

    const inserted = returnedRows<{ id: string }>(
      await manager.query(
        `INSERT INTO "user_achievement"
           ("userId", "badgeId", "ruleId", "eventId")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("userId", "badgeId") DO NOTHING
         RETURNING "id"`,
        [input.event.userId, badgeId, ...provenance(input)],
      ),
    );

    // Enqueue only what was actually awarded. A badge the user already holds
    // must not queue a second celebration, and gating on the insert is what
    // makes that true without a second existence check.
    if (inserted.length === 0) {
      return;
    }

    await manager.query(
      `INSERT INTO "badge_cooldown_queue"
         ("userId", "badgeId", "ruleId", "eventId")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("userId", "badgeId") DO NOTHING`,
      [input.event.userId, badgeId, ...provenance(input)],
    );

    // Reported only on the path that got past the insert gate above, so a rule
    // re-awarding a badge the user already holds produces no second moment. The
    // router captures this once the transaction commits.
    return {
      analytics: {
        event: productEventTokens.badgeEarned,
        properties: { badgeId, ruleId: input.rule.id },
      },
    };
  }
}

/** Records an in-app message for this user; Notifications delivers it. */
@Injectable()
export class InAppMessageHandler implements ContentEngineEffectHandler {
  constructor(private readonly notificationsService: NotificationsService) {}

  async write(
    manager: EntityManager,
    input: EffectDispatchInput,
  ): Promise<void> {
    const notification = inAppNotificationParameters(
      input.rule.effectParams,
      effectTypeTokens.inAppMessage,
    );

    const inserted = returnedRows<{ id: string }>(
      await manager.query(
        `INSERT INTO "engine_in_app_message"
         ("userId", "message", "ruleId", "eventId")
       VALUES ($1, $2, $3, $4)
       RETURNING "id"`,
        [input.event.userId, notification.message, ...provenance(input)],
      ),
    );

    await this.notificationsService.createInAppNotification(manager, {
      userId: input.event.userId,
      notificationType: notification.notificationType,
      title: notification.title,
      message: notification.message,
      actionUrl: notification.actionUrl,
      dedupeKey: `engine:${input.rule.id}:${input.event.id}`,
      sourceEngineMessageId: inserted[0]?.id ?? null,
      sourceRuleId: input.rule.id,
      sourceEventId: input.event.id,
    });
  }
}
