# Task 1 implementation report

## Summary

Implemented the pure deterministic FIFO in-app notification queue required for Task 1, with strict TDD:
test written first, red run verified, queue functions implemented, green run verified, then committed.

## Files changed

- `web/src/lib/in-app-notification-queue.ts`
- `web/src/lib/in-app-notification-queue.test.ts`

## Commit

- `ddc745d44099af57cd34dabc7d0b280983b3cccc`

## Red phase

Command:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","types":["node"]}' node --require ts-node/register --test src/lib/in-app-notification-queue.test.ts
```

Output:

```text
TAP version 13
# /Users/codelawd/Documents/development/contentual/web/node_modules/ts-node/src/index.ts:859
#     return new TSError(diagnosticText, diagnosticCodes, diagnosticCodes);
# TSError: ⨯ Unable to compile TypeScript:
# src/lib/in-app-notification-queue.test.ts(9,8): error TS2307: Cannot find module './in-app-notification-queue' or its corresponding type declarations.
# src/lib/in-app-notification-queue.test.ts(35,38): error TS7006: Parameter 'item' implicitly has an 'any' type.
# Subtest: /Users/codelawd/Documents/development/contentual/web/src/lib/in-app-notification-queue.test.ts
not ok 1 - /Users/codelawd/Documents/development/contentual/web/src/lib/in-app-notification-queue.test.ts
```

Result: red, as expected, because the queue module did not exist yet.

## Green phase

Command:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","types":["node"]}' node --require ts-node/register --test src/lib/in-app-notification-queue.test.ts
```

Output:

```text
TAP version 13
# Subtest: queues unread hydration oldest first and ignores duplicate replay
ok 1 - queues unread hydration oldest first and ignores duplicate replay
# Subtest: shown notifications are not requeued during reconnect hydration
ok 2 - shown notifications are not requeued during reconnect hydration
# Subtest: advancing and dismissing preserve FIFO order
ok 3 - advancing and dismissing preserve FIFO order
1..3
# pass 3
# fail 0
```

Result: green.

## Behavior implemented

- Queue state tracks `active`, `queued`, and `shownIds`.
- Hydration batches are sorted by `createdAt` ascending, then `id` ascending.
- Read notifications, already-shown notifications, the active item, and already-queued ids are ignored on enqueue.
- FIFO promotion is deterministic via `advanceInAppNotificationQueue`.
- Removing the active item promotes the next queued item.
- Clearing the queue leaves the current active notification untouched.
- All functions are immutable and pure.

## Concerns

- Only the focused queue test was run, per task scope.
- I did not touch React code, browser globals, or the existing hook integration.
- `shownIds` is intentionally preserved on removal/clear, matching the task contract and keeping replay suppression stable.

## Round 1 fix report

### Files changed

- `web/src/lib/in-app-notification-queue.test.ts`
- `.superpowers/sdd/2026-08-10-realtime-in-app-message-surface/task-1-report.md`

### Focused test command

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","types":["node"]}' node --require ts-node/register --test src/lib/in-app-notification-queue.test.ts
```

### Output

```text
TAP version 13
# Subtest: queues unread hydration oldest first and ignores duplicate replay
ok 1 - queues unread hydration oldest first and ignores duplicate replay
# Subtest: hydrates by createdAt then id and filters read notifications
ok 2 - hydrates by createdAt then id and filters read notifications
# Subtest: shown notifications are not requeued during reconnect hydration
ok 3 - shown notifications are not requeued during reconnect hydration
# Subtest: clearQueuedInAppNotifications clears queued items but keeps active visible
ok 4 - clearQueuedInAppNotifications clears queued items but keeps active visible
# Subtest: shown ids are preserved across removal and clear so replay is ignored
ok 5 - shown ids are preserved across removal and clear so replay is ignored
# Subtest: advancing and dismissing preserve FIFO order
ok 6 - advancing and dismissing preserve FIFO order
1..6
# tests 6
# pass 6
# fail 0
```

### Notes

- This round only expanded test coverage for the missing review findings.
- No production queue behavior changed because the tests did not expose a defect.
