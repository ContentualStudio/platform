import assert from "node:assert/strict";
import test from "node:test";

import {
  conditionSourceTokens,
  dedupeScopeTokens,
  effectTypeTokens,
  eventNameTokens,
  operatorTokens,
} from "@contentual/content-engine-vocabulary";

import { validateRuleForPublish, type AuthoredEngineRule } from "./rule-authoring";

// A complete, valid rule. Each test overrides only the part it exercises, so a
// failure points at the overridden field rather than at incidental setup.
const baseRule = {
  triggerEvent: eventNameTokens.taskCompleted,
  conditions: [],
  effectType: effectTypeTokens.inAppMessage,
  message: "Nice work",
  dedupeScope: dedupeScopeTokens.oncePerUser,
  active: true,
};

function publish(overrides: Record<string, unknown> = {}) {
  return validateRuleForPublish({ ...baseRule, ...overrides });
}

// Most tests care about what the author is told; the field each error is
// addressed to has its own test.
function errorsOf(result: ReturnType<typeof validateRuleForPublish>) {
  assert.equal(result.valid, false, "expected the rule to be rejected");
  return result.valid ? [] : result.errors.map((error) => error.message);
}

test("normalizes a complete rule with event and user conditions", () => {
  const conditions = [
    {
      source: conditionSourceTokens.event,
      field: "contentType",
      operator: operatorTokens.eq,
      value: "video",
    },
    {
      source: conditionSourceTokens.user,
      field: "programmes_completed",
      operator: operatorTokens.gte,
      value: 2,
    },
    {
      source: conditionSourceTokens.user,
      field: "is_founding_creator",
      operator: operatorTokens.eq,
      value: true,
    },
    {
      source: conditionSourceTokens.user,
      field: "subscription_status",
      operator: operatorTokens.in,
      value: ["pro", "trial"],
    },
  ];

  assert.deepEqual(publish({ conditions }), {
    valid: true,
    rule: {
      triggerEvent: eventNameTokens.taskCompleted,
      conditions,
      effectType: effectTypeTokens.inAppMessage,
      effectParams: { message: "Nice work" },
      dedupeScope: dedupeScopeTokens.oncePerUser,
      active: true,
    },
  });
});

test("drops authoring-only extras from normalized conditions", () => {
  const result = publish({
    conditions: [
      {
        source: conditionSourceTokens.event,
        field: "contentType",
        operator: operatorTokens.eq,
        value: "video",
        id: "payload-row-id",
      },
    ],
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.valid ? result.rule.conditions : [], [
    {
      source: conditionSourceTokens.event,
      field: "contentType",
      operator: operatorTokens.eq,
      value: "video",
    },
  ]);
});

test("treats a missing active flag as inactive", () => {
  const result = publish({ active: undefined });

  assert.equal(result.valid, true);
  assert.equal(result.valid && result.rule.active, false);
});

test("rejects an unknown or missing trigger event", () => {
  assert.deepEqual(errorsOf(publish({ triggerEvent: "post.viral" })), [
    "post.viral is not a known event",
  ]);
  assert.deepEqual(errorsOf(publish({ triggerEvent: undefined })), [
    "A trigger event is required",
  ]);
});

test("rejects a field the trigger event cannot read", () => {
  assert.deepEqual(
    errorsOf(
      publish({
        conditions: [
          {
            source: conditionSourceTokens.event,
            field: "consecutiveSkipCount",
            operator: operatorTokens.gte,
            value: 2,
          },
        ],
      }),
    ),
    ["Condition 1: consecutiveSkipCount is not readable from task.completed"],
  );
});

test("rejects invalid operators and mistyped condition values", () => {
  const rejects = (
    condition: Record<string, unknown>,
    expectedError: string,
  ) => {
    assert.deepEqual(errorsOf(publish({ conditions: [condition] })), [
      expectedError,
    ]);
  };

  rejects(
    {
      source: conditionSourceTokens.user,
      field: "subscription_status",
      operator: operatorTokens.gte,
      value: "pro",
    },
    "Condition 1: gte is not valid for string fields",
  );

  // No server-side coercion: a numeric field authored with a string value is an
  // error, not a parse.
  rejects(
    {
      source: conditionSourceTokens.user,
      field: "programmes_completed",
      operator: operatorTokens.gte,
      value: "2",
    },
    "Condition 1: expected value must be a number",
  );

  rejects(
    {
      source: conditionSourceTokens.user,
      field: "is_founding_creator",
      operator: operatorTokens.eq,
      value: "true",
    },
    "Condition 1: expected value must be a boolean",
  );

  rejects(
    {
      source: conditionSourceTokens.user,
      field: "programmes_completed",
      operator: operatorTokens.in,
      value: [1, "2"],
    },
    "Condition 1: expected values must all be numbers",
  );

  rejects(
    {
      source: "profile",
      field: "user_type",
      operator: operatorTokens.eq,
      value: "creator",
    },
    "Condition 1: profile is not a known condition source",
  );
});

test("rejects malformed condition rows", () => {
  assert.deepEqual(errorsOf(publish({ conditions: "none" })), [
    "Conditions must be a list",
  ]);
  assert.deepEqual(errorsOf(publish({ conditions: [null] })), [
    "Condition 1: must be a condition record",
  ]);
});

test("rejects an unknown dedupe scope", () => {
  assert.deepEqual(errorsOf(publish({ dedupeScope: "once_per_week" })), [
    "once_per_week is not a known dedupe scope",
  ]);
});

test("accepts each supported effect with its required parameter", () => {
  const cases = [
    {
      overrides: {
        effectType: effectTypeTokens.suggestProgramme,
        programme: "12",
      },
      effectParams: { programmeSourceId: "12" },
    },
    {
      overrides: {
        effectType: effectTypeTokens.unlockProgramme,
        programme: { id: 12 },
      },
      effectParams: { programmeSourceId: "12" },
    },
    {
      overrides: { effectType: effectTypeTokens.awardBadge, badge: 7 },
      effectParams: { badgeSourceId: "7" },
    },
    {
      overrides: { effectType: effectTypeTokens.promptCall, callType: { id: "3" } },
      effectParams: { callTypeSourceId: "3" },
    },
    {
      overrides: {
        effectType: effectTypeTokens.inAppMessage,
        message: "  Keep going  ",
      },
      effectParams: { message: "Keep going" },
    },
  ];

  for (const { overrides, effectParams } of cases) {
    const result = validateRuleForPublish({
      ...baseRule,
      message: undefined,
      ...overrides,
    });

    assert.equal(
      result.valid,
      true,
      `${String(overrides.effectType)} should publish`,
    );
    assert.deepEqual(result.valid && result.rule.effectParams, effectParams);
  }
});

test("rejects each supported effect when its parameter is missing", () => {
  const missing = (effectType: string, expectedError: string) => {
    assert.deepEqual(
      errorsOf(publish({ effectType, message: undefined })),
      [expectedError],
    );
  };

  missing(
    effectTypeTokens.suggestProgramme,
    "suggest_programme requires a programme",
  );
  missing(
    effectTypeTokens.unlockProgramme,
    "unlock_programme requires a programme",
  );
  missing(effectTypeTokens.awardBadge, "award_badge requires a badge");
  missing(effectTypeTokens.promptCall, "prompt_call requires a call type");
  assert.deepEqual(errorsOf(publish({ message: "   " })), [
    "in-app-message requires a message",
  ]);
});

test("rejects an unresolvable relationship value", () => {
  assert.deepEqual(
    errorsOf(
      publish({
        effectType: effectTypeTokens.awardBadge,
        badge: { slug: "streak-7" },
        message: undefined,
      }),
    ),
    ["award_badge requires a badge"],
  );
});

test("rejects grant_call with the v1 publication error", () => {
  assert.deepEqual(
    errorsOf(publish({ effectType: effectTypeTokens.grantCall })),
    ["grant_call is not available in v1"],
  );
});

test("rejects an unknown effect type", () => {
  assert.deepEqual(errorsOf(publish({ effectType: "send_carrier_pigeon" })), [
    "send_carrier_pigeon is not a known effect",
  ]);
  assert.deepEqual(errorsOf(publish({ effectType: undefined })), [
    "An effect is required",
  ]);
});

test("reports every problem in one pass rather than the first", () => {
  assert.deepEqual(
    errorsOf(
      validateRuleForPublish({
        triggerEvent: eventNameTokens.taskCompleted,
        conditions: [
          {
            source: conditionSourceTokens.user,
            field: "email",
            operator: operatorTokens.eq,
            value: "a@b.c",
          },
        ],
        effectType: effectTypeTokens.awardBadge,
        dedupeScope: "weekly",
        active: true,
      }),
    ),
    [
      "Condition 1: email is not an allowed user attribute",
      "award_badge requires a badge",
      "weekly is not a known dedupe scope",
    ],
  );
});

test("addresses each error to the field that must be fixed", () => {
  const result = validateRuleForPublish({
    triggerEvent: "post.viral",
    conditions: "none",
    effectType: effectTypeTokens.awardBadge,
    dedupeScope: "weekly",
  });

  assert.equal(result.valid, false);
  assert.deepEqual(
    result.valid ? [] : result.errors.map((error) => error.field),
    ["triggerEvent", "conditions", "badge", "dedupeScope"],
  );
});

test("never throws on malformed input", () => {
  assert.doesNotThrow(() =>
    validateRuleForPublish({
      triggerEvent: null,
      conditions: [null, 42],
      effectType: null,
      dedupeScope: null,
    } as AuthoredEngineRule),
  );
});
