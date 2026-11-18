import "reflect-metadata";
import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { EntityManager } from "typeorm";
import { OPTIONAL_DEPS_METADATA } from "@nestjs/common/constants";
import {
  dedupeScopeTokens,
  effectTypeTokens,
  eventNameTokens,
  type EffectType,
} from "@contentual/content-engine-vocabulary";
import type { ContentEvent } from "../content-event";
import type { EffectDispatchInput } from "../effect-dispatcher.port";
import { NotificationsService } from "../../notifications/notifications.service";
import {
  EffectTargetInactiveError,
  EffectTargetUnavailableError,
  type ContentEngineEffectHandler,
} from "./effect-handler";
import { EffectParameterError } from "./effect-parameters";
import {
  AwardBadgeHandler,
  InAppMessageHandler,
  PromptCallHandler,
  SuggestProgrammeHandler,
  UnlockProgrammeHandler,
} from "./effect-handlers";

interface Recorded {
  sql: string;
  parameters: unknown[];
}

const noopNotificationsService = {
  async createInAppNotification() {
    return null;
  },
} as unknown as NotificationsService;

function inAppMessageHandler(): InAppMessageHandler {
  return new InAppMessageHandler(noopNotificationsService);
}

test("in-app handler keeps the runtime NotificationsService injection token", () => {
  const parameters = Reflect.getMetadata(
    "design:paramtypes",
    InAppMessageHandler,
  ) as unknown[] | undefined;

  assert.equal(parameters?.[0], NotificationsService);
});

test("in-app handler requires NotificationsService wiring", () => {
  assert.equal(
    Reflect.getMetadata(OPTIONAL_DEPS_METADATA, InAppMessageHandler),
    undefined,
  );
});

// Answers the target probe, then the writes. `targetExists: false` models a
// mirror that has not synchronised the target yet; `targetActive: false` models
// a target that is mirrored and switched off. They are deliberately separate.
function fakeManager(
  options: {
    targetExists?: boolean;
    targetActive?: boolean;
    awardInserted?: boolean;
  } = {},
) {
  const queries: Recorded[] = [];

  const manager = {
    query: async (sql: string, parameters: unknown[] = []) => {
      queries.push({ sql, parameters });

      if (sql.includes('AS "targetActive"')) {
        if (options.targetExists === false) {
          return [];
        }
        return [{ targetActive: options.targetActive !== false }];
      }

      if (sql.includes("user_achievement")) {
        return options.awardInserted === false ? [] : [{ id: "1" }];
      }

      return [];
    },
  } as unknown as EntityManager;

  return { manager, queries };
}

function input(
  effectType: EffectType,
  effectParams: Record<string, unknown>,
): EffectDispatchInput {
  return {
    rule: {
      id: "rule-1",
      key: "a-rule",
      triggerEvent: eventNameTokens.taskCompleted,
      conditions: [],
      effectType,
      effectParams,
      dedupeScope: dedupeScopeTokens.oncePerUser,
    },
    event: {
      id: "event-1",
      eventName: eventNameTokens.taskCompleted,
      userId: "user-1",
      payload: {
        userId: "user-1",
        programmeId: "programme-1",
        taskId: "task-1",
        contentType: "video",
      },
    } as ContentEvent,
    reservation: {
      fresh: true,
      ledgerId: "ledger-1",
      leaseToken: "lease-1",
      attempt: 1,
    },
  };
}

function writes(queries: Recorded[]): Recorded[] {
  return queries.filter((query) => query.sql.includes("INSERT"));
}

test("suggest_programme records a suggestion for the acting user", async () => {
  const { manager, queries } = fakeManager();

  await new SuggestProgrammeHandler().write(
    manager,
    input(effectTypeTokens.suggestProgramme, { programmeSourceId: "programme-9" }),
  );

  const [write] = writes(queries);
  assert.match(write.sql, /engine_programme_suggestion/);
  assert.deepEqual(write.parameters, [
    "user-1",
    "programme-9",
    "rule-1",
    "event-1",
    100,
  ]);
});

test("unlock_programme records an unlock and never enrols", async () => {
  const { manager, queries } = fakeManager();

  await new UnlockProgrammeHandler().write(
    manager,
    input(effectTypeTokens.unlockProgramme, { programmeSourceId: "programme-9" }),
  );

  const [write] = writes(queries);
  assert.match(write.sql, /engine_programme_unlock/);

  // Enrolment lives in challenge_setup; the engine must not touch it.
  for (const query of queries) {
    assert.ok(!query.sql.includes("challenge_setup"));
    assert.ok(!query.sql.includes("programme_task_progress"));
  }
});

test("prompt_call records a prompt of the rule's call type", async () => {
  const { manager, queries } = fakeManager();

  await new PromptCallHandler().write(
    manager,
    input(effectTypeTokens.promptCall, { callTypeSourceId: "call-type-3" }),
  );

  const [write] = writes(queries);
  assert.match(write.sql, /engine_call_prompt/);
  assert.deepEqual(write.parameters, [
    "user-1",
    "call-type-3",
    "rule-1",
    "event-1",
  ]);
});

test("in-app-message records the rule's message", async () => {
  const { manager, queries } = fakeManager();

  await inAppMessageHandler().write(
    manager,
    input(effectTypeTokens.inAppMessage, { message: "Nice work!" }),
  );

  const [write] = writes(queries);
  assert.match(write.sql, /engine_in_app_message/);
  assert.deepEqual(write.parameters, [
    "user-1",
    "Nice work!",
    "rule-1",
    "event-1",
  ]);
});

test("in-app-message rejects unsafe action URLs before writing an effect row", async () => {
  const { manager, queries } = fakeManager();

  await assert.rejects(
    () =>
      inAppMessageHandler().write(
        manager,
        input(effectTypeTokens.inAppMessage, {
          message: "Nice work!",
          actionUrl: "//evil.example",
        }),
      ),
    EffectParameterError,
  );

  assert.equal(queries.length, 0);
});

test("in-app-message creates the user inbox row through the same manager", async () => {
  const calls: Array<{ manager: unknown; input: Record<string, unknown> }> = [];
  const manager = {
    async query(sql: string) {
      if (sql.includes("engine_in_app_message")) {
        return [{ id: "engine-message-9" }];
      }
      return [];
    },
  };
  const notificationsService = {
    async createInAppNotification(receivedManager: unknown, input: Record<string, unknown>) {
      calls.push({ manager: receivedManager, input });
      return null;
    },
  };

  await new InAppMessageHandler(notificationsService as never).write(
    manager as never,
    input(effectTypeTokens.inAppMessage, {
      message: "Nice work!",
      notificationType: "badge_earned",
      title: "Badge earned",
      actionUrl: "/achievements",
    }),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].manager, manager);
  assert.deepEqual(calls[0].input, {
    userId: "user-1",
    notificationType: "badge_earned",
    title: "Badge earned",
    message: "Nice work!",
    actionUrl: "/achievements",
    dedupeKey: "engine:rule-1:event-1",
    sourceEngineMessageId: "engine-message-9",
    sourceRuleId: "rule-1",
    sourceEventId: "event-1",
  });
});

test("award_badge inserts the achievement idempotently and enqueues it", async () => {
  const { manager, queries } = fakeManager();

  await new AwardBadgeHandler().write(
    manager,
    input(effectTypeTokens.awardBadge, { badgeSourceId: "badge-7" }),
  );

  const [achievement, queued] = writes(queries);
  assert.match(achievement.sql, /user_achievement/);
  assert.match(achievement.sql, /ON CONFLICT \("userId", "badgeId"\) DO NOTHING/);
  assert.match(queued.sql, /badge_cooldown_queue/);
  assert.deepEqual(queued.parameters, ["user-1", "badge-7", "rule-1", "event-1"]);
});

test("award_badge does not enqueue a badge the user already holds", async () => {
  const { manager, queries } = fakeManager({ awardInserted: false });

  await new AwardBadgeHandler().write(
    manager,
    input(effectTypeTokens.awardBadge, { badgeSourceId: "badge-7" }),
  );

  assert.ok(
    !queries.some((query) => query.sql.includes("badge_cooldown_queue")),
    "a re-award must not queue a second celebration",
  );
});

test("award_badge never fires a celebration directly", async () => {
  const { manager, queries } = fakeManager();

  await new AwardBadgeHandler().write(
    manager,
    input(effectTypeTokens.awardBadge, { badgeSourceId: "badge-7" }),
  );

  // The queue row is the only celebration signal; nothing is released here.
  for (const query of queries) {
    assert.ok(!query.sql.includes("released"));
    assert.ok(!query.sql.includes("UPDATE"));
  }
});

const missingParameterCases: ReadonlyArray<
  [string, () => ContentEngineEffectHandler, EffectType, Record<string, unknown>]
> = [
  [effectTypeTokens.suggestProgramme, () => new SuggestProgrammeHandler(), effectTypeTokens.suggestProgramme, {}],
  [effectTypeTokens.unlockProgramme, () => new UnlockProgrammeHandler(), effectTypeTokens.unlockProgramme, {}],
  [effectTypeTokens.promptCall, () => new PromptCallHandler(), effectTypeTokens.promptCall, {}],
  [effectTypeTokens.awardBadge, () => new AwardBadgeHandler(), effectTypeTokens.awardBadge, {}],
  [effectTypeTokens.inAppMessage, inAppMessageHandler, effectTypeTokens.inAppMessage, {}],
  [
    "in-app-message with a blank message",
    inAppMessageHandler,
    effectTypeTokens.inAppMessage,
    { message: "   " },
  ],
];

for (const [name, build, effectType, params] of missingParameterCases) {
  test(`${name} rejects missing parameters before writing`, async () => {
    const { manager, queries } = fakeManager();

    await assert.rejects(
      () => build().write(manager, input(effectType, params)),
      EffectParameterError,
    );
    assert.deepEqual(writes(queries), [], "nothing may be written");
  });
}

const targetCases: ReadonlyArray<
  [string, () => ContentEngineEffectHandler, EffectType, Record<string, unknown>]
> = [
  [
    effectTypeTokens.suggestProgramme,
    () => new SuggestProgrammeHandler(),
    effectTypeTokens.suggestProgramme,
    { programmeSourceId: "missing" },
  ],
  [
    effectTypeTokens.unlockProgramme,
    () => new UnlockProgrammeHandler(),
    effectTypeTokens.unlockProgramme,
    { programmeSourceId: "missing" },
  ],
  [
    effectTypeTokens.promptCall,
    () => new PromptCallHandler(),
    effectTypeTokens.promptCall,
    { callTypeSourceId: "missing" },
  ],
  [
    effectTypeTokens.awardBadge,
    () => new AwardBadgeHandler(),
    effectTypeTokens.awardBadge,
    { badgeSourceId: "missing" },
  ],
];

for (const [name, build, effectType, params] of targetCases) {
  test(`${name} reports an unmirrored target as retryable, not permanent`, async () => {
    const { manager, queries } = fakeManager({ targetExists: false });

    await assert.rejects(
      () => build().write(manager, input(effectType, params)),
      // The target mirror may simply not have synchronised yet, so this must
      // not be a PermanentEffectError — that would lose the effect.
      EffectTargetUnavailableError,
    );
    assert.deepEqual(writes(queries), []);
  });
}

test("the target probe selects the active flag rather than filtering on it", async () => {
  // Filtering would make an absent row and an inactive row the same empty
  // result, and they need opposite retry answers.
  const badge = fakeManager();
  await new AwardBadgeHandler().write(
    badge.manager,
    input(effectTypeTokens.awardBadge, { badgeSourceId: "badge-7" }),
  );
  assert.match(badge.queries[0].sql, /SELECT "active" AS "targetActive"/);
  assert.ok(!badge.queries[0].sql.includes('"active" = true'));

  const call = fakeManager();
  await new PromptCallHandler().write(
    call.manager,
    input(effectTypeTokens.promptCall, { callTypeSourceId: "call-3" }),
  );
  assert.match(call.queries[0].sql, /SELECT "active" AS "targetActive"/);

  // The programme mirror carries no `active` column; existence is the check.
  const programme = fakeManager();
  await new SuggestProgrammeHandler().write(
    programme.manager,
    input(effectTypeTokens.suggestProgramme, { programmeSourceId: "programme-9" }),
  );
  assert.match(programme.queries[0].sql, /SELECT TRUE AS "targetActive"/);
});

const activeFlagCases: ReadonlyArray<
  [string, () => ContentEngineEffectHandler, EffectType, Record<string, unknown>]
> = [
  [
    effectTypeTokens.awardBadge,
    () => new AwardBadgeHandler(),
    effectTypeTokens.awardBadge,
    { badgeSourceId: "badge-7" },
  ],
  [
    effectTypeTokens.promptCall,
    () => new PromptCallHandler(),
    effectTypeTokens.promptCall,
    { callTypeSourceId: "call-3" },
  ],
];

for (const [name, build, effectType, params] of activeFlagCases) {
  test(`${name} treats a mirrored but inactive target as permanent`, async () => {
    const { manager, queries } = fakeManager({ targetActive: false });

    await assert.rejects(
      () => build().write(manager, input(effectType, params)),
      // The row arrived and says no. Retrying would wait for an editorial
      // change that may never come.
      EffectTargetInactiveError,
    );
    assert.deepEqual(writes(queries), []);
  });
}

test("no handler writes the rules mirror", async () => {
  const handlers: ReadonlyArray<[ContentEngineEffectHandler, EffectType, Record<string, unknown>]> = [
    [new SuggestProgrammeHandler(), effectTypeTokens.suggestProgramme, { programmeSourceId: "p" }],
    [new UnlockProgrammeHandler(), effectTypeTokens.unlockProgramme, { programmeSourceId: "p" }],
    [new PromptCallHandler(), effectTypeTokens.promptCall, { callTypeSourceId: "c" }],
    [new AwardBadgeHandler(), effectTypeTokens.awardBadge, { badgeSourceId: "b" }],
    [inAppMessageHandler(), effectTypeTokens.inAppMessage, { message: "hi" }],
  ];

  for (const [handler, effectType, params] of handlers) {
    const { manager, queries } = fakeManager();
    await handler.write(manager, input(effectType, params));

    for (const query of queries) {
      if (query.sql.includes("engine_rules")) {
        assert.fail(`${effectType} must not touch the rules mirror`);
      }
    }
  }
});

test("every write is scoped to the acting user", async () => {
  const handlers: ReadonlyArray<[ContentEngineEffectHandler, EffectType, Record<string, unknown>]> = [
    [new SuggestProgrammeHandler(), effectTypeTokens.suggestProgramme, { programmeSourceId: "p" }],
    [new UnlockProgrammeHandler(), effectTypeTokens.unlockProgramme, { programmeSourceId: "p" }],
    [new PromptCallHandler(), effectTypeTokens.promptCall, { callTypeSourceId: "c" }],
    [new AwardBadgeHandler(), effectTypeTokens.awardBadge, { badgeSourceId: "b" }],
    [inAppMessageHandler(), effectTypeTokens.inAppMessage, { message: "hi" }],
  ];

  for (const [handler, effectType, params] of handlers) {
    const { manager, queries } = fakeManager();
    await handler.write(manager, input(effectType, params));

    for (const write of writes(queries)) {
      assert.equal(
        write.parameters[0],
        "user-1",
        `${effectType} must write against the acting user`,
      );
    }
  }
});

test("completion candidates snapshot priority even when their target is missing", async () => {
  const { manager, queries } = fakeManager({ targetExists: false });
  const effect = input(effectTypeTokens.suggestProgramme, {
    programmeSourceId: "missing",
  });
  const completion = {
    ...effect,
    rule: { ...effect.rule, priority: 7 },
    event: { ...effect.event, eventName: "programme.completed" },
  } as EffectDispatchInput;
  await new SuggestProgrammeHandler().write(manager, completion);
  assert.deepEqual(writes(queries)[0].parameters, [
    "user-1",
    "missing",
    "rule-1",
    "event-1",
    7,
  ]);
});
