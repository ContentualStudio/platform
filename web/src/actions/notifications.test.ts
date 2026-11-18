import * as assert from "node:assert/strict";
import { test } from "node:test";
import { parseNotificationPreferencesActionResponse } from "../lib/notification-preference-actions";
import { ActionFailure } from "../lib/server/result";

const responsePayload = {
  preferences: [
    {
      type: "daily_task_notice",
      label: "Daily task notice",
      description: "Reminder when your daily challenge is ready",
      channels: [
        {
          channel: "email",
          label: "Email",
          optedOut: false,
          defaultOptedOut: false,
        },
      ],
    },
  ],
};

test("preference action parser returns only validated preference data on success", () => {
  assert.deepEqual(
    parseNotificationPreferencesActionResponse(
      new Response(null, { status: 200 }),
      responsePayload,
      "We couldn't load your notification preferences.",
    ),
    responsePayload.preferences,
  );
});

// Raised rather than returned so the shared wrapper answers with the api's own
// code and message, instead of reporting a refusal to PostHog as a bug.
test("preference action parser raises API errors as named failures", () => {
  assert.throws(
    () =>
      parseNotificationPreferencesActionResponse(
        new Response(null, { status: 400 }),
        {
          code: "INVALID_NOTIFICATION_PREFERENCE",
          message: "The notification preference is invalid.",
        },
        "We couldn't save your notification preference.",
      ),
    (error: unknown) =>
      error instanceof ActionFailure &&
      error.code === "INVALID_NOTIFICATION_PREFERENCE" &&
      error.message === "The notification preference is invalid.",
  );
});

test("preference action parser falls back when the api sends no code or message", () => {
  assert.throws(
    () =>
      parseNotificationPreferencesActionResponse(
        new Response(null, { status: 500 }),
        {},
        "We couldn't load your notification preferences.",
      ),
    (error: unknown) =>
      error instanceof ActionFailure &&
      error.code === "NOTIFICATION_REQUEST_FAILED" &&
      error.message === "We couldn't load your notification preferences.",
  );
});

test("preference action parser rejects malformed successful responses", () => {
  assert.throws(
    () =>
      parseNotificationPreferencesActionResponse(
        new Response(null, { status: 200 }),
        { preferences: "not-an-array" },
        "We couldn't load your notification preferences.",
      ),
    (error: unknown) =>
      error instanceof ActionFailure &&
      error.code === "INVALID_NOTIFICATION_RESPONSE",
  );
});
