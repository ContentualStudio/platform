import * as assert from "node:assert/strict";
import { test } from "node:test";
import { parseDemoInAppNotificationArgs } from "./demo-in-app-notification";

test("demo parser requires a user, a type, and a registered notification type", () => {
  assert.throws(
    () => parseDemoInAppNotificationArgs([], {}),
    /DEMO_USER_ID is required/,
  );

  assert.throws(
    () =>
      parseDemoInAppNotificationArgs([], {
        DEMO_USER_ID: "user-1",
      }),
    /--type is required/,
  );

  assert.throws(
    () =>
      parseDemoInAppNotificationArgs(["--type", "instagram"], {
        DEMO_USER_ID: "user-1",
      }),
    /Unsupported notification type: instagram/,
  );

  assert.deepEqual(
    parseDemoInAppNotificationArgs(["--type", "badge_earned"], {
      DEMO_USER_ID: "user-1",
    }),
    {
      userId: "user-1",
      notificationType: "badge_earned",
    },
  );
});

test("demo parser accepts a safe internal action URL", () => {
  assert.deepEqual(
    parseDemoInAppNotificationArgs(
      ["--type", "badge_earned", "--action-url", "/achievements"],
      { DEMO_USER_ID: "user-1" },
    ),
    {
      userId: "user-1",
      notificationType: "badge_earned",
      actionUrl: "/achievements",
    },
  );
});

test("demo parser rejects unsafe action URLs before creating the app context", () => {
  for (const actionUrl of ["//evil.example", "https://example.com", "\\", ""]) {
    assert.throws(
      () =>
        parseDemoInAppNotificationArgs(
          ["--type", "badge_earned", "--action-url", actionUrl],
          { DEMO_USER_ID: "user-1" },
        ),
      /--action-url must be a safe internal path/,
    );
  }
});
