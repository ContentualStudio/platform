import * as assert from "node:assert/strict";
import { test } from "node:test";
import { effectTypeTokens } from "@contentual/content-engine-vocabulary";
import {
  EffectParameterError,
  inAppNotificationParameters,
} from "./effect-parameters";

test("typed in-app messages default their title from the notification registry", () => {
  assert.deepEqual(
    inAppNotificationParameters(
      { message: "You unlocked a badge.", notificationType: "badge_earned" },
      effectTypeTokens.inAppMessage,
    ),
    {
      message: "You unlocked a badge.",
      title: "Badge earned",
      notificationType: "badge_earned",
      actionUrl: null,
    },
  );
});

test("legacy untyped in-app messages keep the generic title", () => {
  assert.equal(
    inAppNotificationParameters(
      { message: "A legacy message." },
      effectTypeTokens.inAppMessage,
    ).title,
    "Notification",
  );
});

test("unsafe or blank optional in-app fields fail before effect writes", () => {
  for (const params of [
    { message: "Message", actionUrl: "//evil.example" },
    { message: "Message", actionUrl: "   " },
    { message: "Message", notificationType: "   " },
    { message: "Message", title: "   " },
    { message: "Message", actionUrl: 42 },
    { message: "Message", title: 42 },
  ]) {
    assert.throws(
      () =>
        inAppNotificationParameters(
          params,
          effectTypeTokens.inAppMessage,
        ),
      EffectParameterError,
    );
  }
});
