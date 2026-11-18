import { ProgrammeContentModule } from "../challenge-setup/programmes/programme-content.module";
import { CompletionSuggestionResolver } from "../progression/completion-suggestion-resolver";
import { CompletionSuggestionEvaluator } from "../progression/completion-suggestion-evaluator";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RuleBackfillRunRepository } from "./backfill/rule-backfill-run.repository";
import { RuleBackfillService } from "./backfill/rule-backfill.service";
import { RuleBackfillWorker } from "./backfill/rule-backfill.worker";
import { ContentEngineAdminController } from "./admin/content-engine-admin.controller";
import { ContentEngineAdminGuard } from "./admin/content-engine-admin.guard";
import { CONTENT_ENGINE_EFFECT_DISPATCHER } from "./effect-dispatcher.port";
import { ContentEngineEffectRouter } from "./effects/content-engine-effect.dispatcher";
import {
  AwardBadgeHandler,
  InAppMessageHandler,
  PromptCallHandler,
  SuggestProgrammeHandler,
  UnlockProgrammeHandler,
} from "./effects/effect-handlers";
import { ContentEngineEventEntity } from "./entities/content-engine-event.entity";
import { EngineFiringLedgerEntity } from "./entities/engine-firing-ledger.entity";
import { EngineRuleRepository } from "./engine-rule.repository";
import { ContentEventDispatcher } from "./event-dispatcher";
import { CONTENT_EVENT_EVALUATOR } from "./event-evaluator.port";
import { ContentEventEmitter } from "./event-emitter";
import { FiringLedgerService } from "./firing-ledger.service";
import { PostHogRuleEvaluationObserver } from "./posthog-rule-evaluation.observer";
import { RULE_EVALUATION_OBSERVER } from "./rule-evaluation-observer.port";
import { RuleEvaluatorService } from "./rule-evaluator.service";
import { RuleFiringService } from "./rule-firing.service";
import { UserAttributeReaderFactory } from "./user-attribute.reader";
import { NotificationsModule } from "../notifications/notifications.module";

// The Content Engine's runtime side: the event outbox every write path emits
// into, the dispatcher that delivers those events after commit, the firing
// ledger that gates every effect, the evaluator that selects and qualifies
// rules, and the five v1 effect handlers that carry them out.
//
// CONTENT_EVENT_EVALUATOR is bound to the real evaluator now that effect
// handlers exist. Until they did it was bound to a provider that threw, so
// events accumulated as `pending` rather than draining into a no-op; whatever
// piled up in the meantime is replayed by dispatchPending().
@Module({
  imports: [
    NotificationsModule,
    ProgrammeContentModule,
    TypeOrmModule.forFeature([
      ContentEngineEventEntity,
      EngineFiringLedgerEntity,
    ]),
  ],
  controllers: [ContentEngineAdminController],
  providers: [
    ContentEventEmitter,
    ContentEventDispatcher,
    FiringLedgerService,
    EngineRuleRepository,
    UserAttributeReaderFactory,
    RuleFiringService,
    RuleEvaluatorService,
    CompletionSuggestionResolver,
    CompletionSuggestionEvaluator,
    RuleBackfillRunRepository,
    RuleBackfillService,
    RuleBackfillWorker,
    ContentEngineAdminGuard,
    PostHogRuleEvaluationObserver,
    SuggestProgrammeHandler,
    UnlockProgrammeHandler,
    PromptCallHandler,
    AwardBadgeHandler,
    InAppMessageHandler,
    ContentEngineEffectRouter,
    {
      provide: CONTENT_ENGINE_EFFECT_DISPATCHER,
      useExisting: ContentEngineEffectRouter,
    },
    {
      provide: RULE_EVALUATION_OBSERVER,
      useExisting: PostHogRuleEvaluationObserver,
    },
    {
      provide: CONTENT_EVENT_EVALUATOR,
      useExisting: CompletionSuggestionEvaluator,
    },
  ],
  // The backfill surface is exported so the admin engine view can drive it
  // directly once it exists; the backfill:rule script and the admin controller
  // above are the two front doors onto the same queue in the meantime.
  exports: [
    ContentEventEmitter,
    ContentEventDispatcher,
    FiringLedgerService,
    RuleBackfillRunRepository,
    RuleBackfillService,
  ],
})
export class ContentEngineModule {}
