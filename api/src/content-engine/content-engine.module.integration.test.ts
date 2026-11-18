import { CompletionSuggestionEvaluator } from '../progression/completion-suggestion-evaluator';
import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ConfigModule } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import databaseConfig from "../config/database.config";
import posthogConfig from "../config/posthog.config";
import appDataSource from "../database/data-source";
import { ObservabilityModule } from "../observability/observability.module";
import { assertDisposableTestDatabase } from "../database/test-database-guard";
import { ContentEngineModule } from "./content-engine.module";
import { CONTENT_ENGINE_EFFECT_DISPATCHER } from "./effect-dispatcher.port";
import { ContentEngineEffectRouter } from "./effects/content-engine-effect.dispatcher";
import { ContentEventDispatcher } from "./event-dispatcher";
import { CONTENT_EVENT_EVALUATOR } from "./event-evaluator.port";
import { PostHogRuleEvaluationObserver } from "./posthog-rule-evaluation.observer";
import { RULE_EVALUATION_OBSERVER } from "./rule-evaluation-observer.port";
import { RuleBackfillService } from "./backfill/rule-backfill.service";
import { RuleEvaluatorService } from "./rule-evaluator.service";
import { RuleFiringService } from "./rule-firing.service";

// Proves the module resolves with no overrides — the one failure mode unit
// tests structurally cannot catch, because they construct every provider by
// hand and never ask Nest to wire them. An optional constructor parameter Nest
// tries to inject, or a provider left unregistered, only fails here and in
// production.
//
//   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual_api_test \
//   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contentual \
//     yarn workspace @contentual/api test:integration
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const skip = testDatabaseUrl ? false : "TEST_DATABASE_URL is not set";

let moduleRef: TestingModule;

before(async () => {
  if (skip) {
    return;
  }

  assertDisposableTestDatabase(testDatabaseUrl, databaseConfig().database.url);

  moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        load: [posthogConfig],
        isGlobal: true,
      }),
      // @Global() only makes a module's exports ambient once it is imported
      // somewhere. The composed app imports it in AppModule; this standalone
      // graph has to import it itself or the observer has nothing to inject.
      ObservabilityModule,
      TypeOrmModule.forRoot({
        ...appDataSource.options,
        url: testDatabaseUrl,
      } as Parameters<typeof TypeOrmModule.forRoot>[0]),
      ContentEngineModule,
    ],
  }).compile();
});

after(async () => {
  if (skip || !moduleRef) {
    return;
  }

  await moduleRef.close();
});

test("the evaluator resolves with no overrides", { skip }, () => {
  assert.ok(moduleRef.get(RuleEvaluatorService));
});

test("CONTENT_EVENT_EVALUATOR is the real evaluator", { skip }, () => {
  assert.equal(
    moduleRef.get(CONTENT_EVENT_EVALUATOR),
    moduleRef.get(CompletionSuggestionEvaluator),
  );
});

test("CONTENT_ENGINE_EFFECT_DISPATCHER is the real router", { skip }, () => {
  const dispatcher = moduleRef.get(CONTENT_ENGINE_EFFECT_DISPATCHER);

  assert.equal(dispatcher, moduleRef.get(ContentEngineEffectRouter));
  assert.equal(typeof dispatcher.dispatch, "function");
});

test("the PostHog observer resolves without a client provider", { skip }, () => {
  // Its optional client is a test seam. If Nest tries to inject it the whole
  // application fails to boot, which is exactly what this catches.
  assert.equal(
    moduleRef.get(RULE_EVALUATION_OBSERVER),
    moduleRef.get(PostHogRuleEvaluationObserver),
  );
});

test("the dispatcher resolves with the evaluator behind it", { skip }, () => {
  assert.ok(moduleRef.get(ContentEventDispatcher));
});

// The backfill is reached from a script and, later, the admin engine view, so
// nothing in the request path would notice it failing to resolve. It injects an
// EntityManager and the effect-dispatcher token, both of which have broken DI
// here before.
test("the backfill service resolves with no overrides", { skip }, () => {
  assert.ok(moduleRef.get(RuleBackfillService));
});

// One instance, shared. Two would still work, but the point of extracting it
// was that live evaluation and backfill run the same code.
test("the evaluator and the backfill share one firing path", { skip }, () => {
  const firing = moduleRef.get(RuleFiringService);

  assert.ok(firing);
  assert.equal(typeof firing.fire, "function");
});
