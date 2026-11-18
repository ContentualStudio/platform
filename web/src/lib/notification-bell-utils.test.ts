import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatRelativeTime,
  shouldOpenNotificationFromKey,
} from "./notification-bell-utils";

test("relative time selects the unit using absolute seconds", () => {
  const now = Date.parse("2026-08-10T15:00:00.000Z");

  assert.equal(
    formatRelativeTime(new Date(now - 5 * 60_000).toISOString(), now),
    "5 minutes ago",
  );
  assert.equal(
    formatRelativeTime(new Date(now - 2 * 60 * 60_000).toISOString(), now),
    "2 hours ago",
  );
});

test("nested dismiss controls do not open the notification row", () => {
  const row = {} as EventTarget;
  const dismissButton = {} as EventTarget;

  assert.equal(
    shouldOpenNotificationFromKey({
      key: "Enter",
      target: row,
      currentTarget: row,
    }),
    true,
  );
  assert.equal(
    shouldOpenNotificationFromKey({
      key: "Enter",
      target: dismissButton,
      currentTarget: row,
    }),
    false,
  );
  assert.equal(
    shouldOpenNotificationFromKey({
      key: " ",
      target: dismissButton,
      currentTarget: row,
    }),
    false,
  );
});
