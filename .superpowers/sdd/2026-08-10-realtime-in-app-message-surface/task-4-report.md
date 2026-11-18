# Task 4 Report — Realtime In-App Message Surface

Date: 2026-08-10

Task: Build the accessible base transient in-app notification toast for the reviewed realtime provider/hook flow.

Slice commit hash: `7909f0193d030507de4bb4db8e95ed75cda1c6fb`

## Files

- Modified: `web/src/components/notifications/in-app-notifications-provider.tsx`
- Added: `web/src/components/notifications/in-app-notification-toast.tsx`
- Added: `web/src/components/notifications/in-app-notification-toast-state.ts`
- Added: `web/src/components/notifications/in-app-notification-toast-state.test.ts`

## What changed

- Rendered a portal-based in-app notification toast from the notifications provider.
- Kept the surface to one active notification with queued-count copy.
- Added reconnecting status rendering without blocking the inbox.
- Added immediate pre-navigation `isSafeInternalActionUrl` validation before `router.push`.
- Added toast lifecycle timing keyed to `activeNotification?.id`, with cleanup on id changes and unmount.
- Preserved local-first manual dismiss through the shared notifications context.
- Added an optional custom `surfaceMap` fallback mechanism for future notification-type renderers.
- Added a pure helper and TDD coverage for visible-state derivation.
- Removed a provider/toast circular import by passing a toast controller object from the provider.

## Verification

### Focused helper test

Command:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","types":["node"]}' node --require ts-node/register --test src/components/notifications/in-app-notification-toast-state.test.ts
```

Output:

```text
TAP version 13
# Subtest: stays quiet when there is no active notification and the stream is not reconnecting
ok 1 - stays quiet when there is no active notification and the stream is not reconnecting
  ---
  duration_ms: 0.871458
  ...
# Subtest: shows reconnecting status even without an active notification
ok 2 - shows reconnecting status even without an active notification
  ---
  duration_ms: 0.407458
  ...
# Subtest: includes the active notification and queued count copy
ok 3 - includes the active notification and queued count copy
  ---
  duration_ms: 0.180709
  ...
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2968.016292
```

### Web lint

Command:

```bash
yarn lint
```

Output:

```text
src/hooks/use-in-app-notifications.ts:116:18: warning eslint(no-await-in-loop): Unexpected `await` inside a loop. help: Collect all promises into an array and use `Promise.all()` to run them in parallel, rather than awaiting each one sequentially inside the loop.
```

Result: exited successfully with a pre-existing warning in `web/src/hooks/use-in-app-notifications.ts`.

### Type check

Command:

```bash
yarn exec tsc --noEmit
```

Output:

```text
(no output)
```

Result: exit code 0.

### Focused notification and URL regression tests

Command:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","types":["node"]}' node --require ts-node/register --test src/components/notifications/in-app-notification-toast-state.test.ts src/lib/internal-action-url.test.ts src/lib/in-app-notification-queue.test.ts src/lib/in-app-notifications.test.ts src/lib/notification-bell-utils.test.ts
```

Output:

```text
TAP version 13
# Subtest: stays quiet when there is no active notification and the stream is not reconnecting
ok 1 - stays quiet when there is no active notification and the stream is not reconnecting
  ---
  duration_ms: 1.103709
  ...
# Subtest: shows reconnecting status even without an active notification
ok 2 - shows reconnecting status even without an active notification
  ---
  duration_ms: 0.486792
  ...
# Subtest: includes the active notification and queued count copy
ok 3 - includes the active notification and queued count copy
  ---
  duration_ms: 0.19875
  ...
# Subtest: queues unread hydration oldest first and ignores duplicate replay
ok 4 - queues unread hydration oldest first and ignores duplicate replay
  ---
  duration_ms: 20.208667
  ...
# Subtest: hydrates by createdAt then id and filters read notifications
ok 5 - hydrates by createdAt then id and filters read notifications
  ---
  duration_ms: 0.144458
  ...
# Subtest: shown notifications are not requeued during reconnect hydration
ok 6 - shown notifications are not requeued during reconnect hydration
  ---
  duration_ms: 0.115625
  ...
# Subtest: clearQueuedInAppNotifications clears queued items but keeps active visible
ok 7 - clearQueuedInAppNotifications clears queued items but keeps active visible
  ---
  duration_ms: 0.10925
  ...
# Subtest: shown ids are preserved across removal and clear so replay is ignored
ok 8 - shown ids are preserved across removal and clear so replay is ignored
  ---
  duration_ms: 0.252917
  ...
# Subtest: a created event appends after hydrated unread messages
ok 9 - a created event appends after hydrated unread messages
  ---
  duration_ms: 0.104209
  ...
# Subtest: a dismiss event removes a queued notification
ok 10 - a dismiss event removes a queued notification
  ---
  duration_ms: 0.088708
  ...
# Subtest: advancing clears the active notification when nothing is queued
ok 11 - advancing clears the active notification when nothing is queued
  ---
  duration_ms: 0.094
  ...
# Subtest: advancing and dismissing preserve FIFO order
ok 12 - advancing and dismissing preserve FIFO order
  ---
  duration_ms: 0.166958
  ...
# Subtest: a created event is inserted once when SSE reconnects and replays it
ok 13 - a created event is inserted once when SSE reconnects and replays it
  ---
  duration_ms: 1.381083
  ...
# Subtest: hydrate replaces a notification dismissed while disconnected
ok 14 - hydrate replaces a notification dismissed while disconnected
  ---
  duration_ms: 0.099792
  ...
# Subtest: validated events buffered during hydration replay after replacement
ok 15 - validated events buffered during hydration replay after replacement
  ---
  duration_ms: 0.118167
  ...
# Subtest: read and dismiss events use their authoritative totals
ok 16 - read and dismiss events use their authoritative totals
  ---
  duration_ms: 8.469125
  ...
# Subtest: server unread total is preserved when the page is limited
ok 17 - server unread total is preserved when the page is limited
  ---
  duration_ms: 0.292042
  ...
# Subtest: read-all updates loaded rows for another tab
ok 18 - read-all updates loaded rows for another tab
  ---
  duration_ms: 0.150084
  ...
# Subtest: external action URLs are rejected by the client schema
ok 19 - external action URLs are rejected by the client schema
  ---
  duration_ms: 2.01075
  ...
# Subtest: accepts same-origin canonical paths
ok 20 - accepts same-origin canonical paths
  ---
  duration_ms: 1.4405
  ...
# Subtest: rejects redirect-like and encoded paths
ok 21 - rejects redirect-like and encoded paths
  ---
  duration_ms: 0.118792
  ...
# Subtest: relative time selects the unit using absolute seconds
ok 22 - relative time selects the unit using absolute seconds
  ---
  duration_ms: 69.486042
  ...
# Subtest: nested dismiss controls do not open the notification row
ok 23 - nested dismiss controls do not open the notification row
  ---
  duration_ms: 0.246333
  ...
1..23
# tests 23
# suites 0
# pass 23
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3091.022417
```

## Concerns

- `yarn lint` still reports a pre-existing `no-await-in-loop` warning in `web/src/hooks/use-in-app-notifications.ts:116:18`. I did not change that loop in this slice.
- The report references the slice commit hash directly; if this report is committed afterward, its own commit hash will differ from the slice hash above.

## Fix Round 1 — Shared viewport semantics for custom renderers

Issue addressed:

- The fixed portal viewport previously left `aria-live="polite"`, `aria-atomic="true"`, `role="status"`, and pointer interaction on the base surface only, so custom `surfaceMap` renderers did not automatically inherit those semantics.

Files updated:

- Modified: `web/src/components/notifications/in-app-notification-toast.tsx`
- Modified: `web/src/components/notifications/in-app-notification-toast-state.ts`
- Modified: `web/src/components/notifications/in-app-notification-toast-state.test.ts`

What changed:

- Added a shared `getInAppNotificationSurfaceProps()` helper for the live-region and pointer-interaction wrapper props.
- Moved the shared live-region, border/background shell, animation, and pointer interaction onto the fixed portal wrapper around the rendered notification surface.
- Kept the fixed right-aligned non-blocking portal section unchanged.
- Reduced the base toast component to inner layout/padding so both base and custom renderers now sit inside the same accessible wrapper.

TDD evidence:

### Red step

Command:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","types":["node"]}' node --require ts-node/register --test src/components/notifications/in-app-notification-toast-state.test.ts
```

Output:

```text
TAP version 13
# /Users/codelawd/Documents/development/contentual/web/node_modules/ts-node/src/index.ts:859
#     return new TSError(diagnosticText, diagnosticCodes, diagnostics);
#            ^
# TSError: ⨯ Unable to compile TypeScript:
# src/components/notifications/in-app-notification-toast-state.test.ts(6,3): error TS2305: Module '"./in-app-notification-toast-state"' has no exported member 'getInAppNotificationSurfaceProps'.
#     at createTSError (/Users/codelawd/Documents/development/contentual/web/node_modules/ts-node/src/index.ts:859:12)
#     at reportTSError (/Users/codelawd/Documents/development/contentual/web/node_modules/ts-node/src/index.ts:863:19)
#     at getOutput (/Users/codelawd/Documents/development/contentual/web/node_modules/ts-node/src/index.ts:1077:36)
#     at Object.compile (/Users/codelawd/Documents/development/contentual/web/node_modules/ts-node/src/index.ts:1433:41)
#     at Module.m._compile (/Users/codelawd/Documents/development/contentual/web/node_modules/ts-node/src/index.ts:1617:30)
#     at Module._extensions..js (node:internal/modules/cjs/loader:1416:10)
#     at Object.require.extensions.<computed> [as .ts] (/Users/codelawd/Documents/development/contentual/web/node_modules/ts-node/src/index.ts:1621:12)
#     at Module.load (node:internal/modules/cjs/loader:1208:32)
#     at Function.Module._load (node:internal/modules/cjs/loader:1024:12)
#     at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:174:12) {
#   diagnosticCodes: [ 2305 ]
# }
# Subtest: /Users/codelawd/Documents/development/contentual/web/src/components/notifications/in-app-notification-toast-state.test.ts
not ok 1 - /Users/codelawd/Documents/development/contentual/web/src/components/notifications/in-app-notification-toast-state.test.ts
  ---
  duration_ms: 2114.702791
  location: '/Users/codelawd/Documents/development/contentual/web/src/components/notifications/in-app-notification-toast-state.test.ts:1:1'
  failureType: 'testCodeFailure'
  exitCode: 1
  signal: ~
  error: 'test failed'
  code: 'ERR_TEST_FAILURE'
  ...
1..1
# tests 1
# suites 0
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2121.415
```

### Green step: focused helper test

Command:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","types":["node"]}' node --require ts-node/register --test src/components/notifications/in-app-notification-toast-state.test.ts
```

Output:

```text
TAP version 13
# Subtest: stays quiet when there is no active notification and the stream is not reconnecting
ok 1 - stays quiet when there is no active notification and the stream is not reconnecting
  ---
  duration_ms: 0.880459
  ...
# Subtest: shows reconnecting status even without an active notification
ok 2 - shows reconnecting status even without an active notification
  ---
  duration_ms: 0.446625
  ...
# Subtest: includes the active notification and queued count copy
ok 3 - includes the active notification and queued count copy
  ---
  duration_ms: 0.095541
  ...
# Subtest: shared surface props preserve live-region and pointer semantics for all renderer paths
ok 4 - shared surface props preserve live-region and pointer semantics for all renderer paths
  ---
  duration_ms: 0.096625
  ...
1..4
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2976.852208
```

### Focused notification and URL regression tests

Command:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","types":["node"]}' node --require ts-node/register --test src/components/notifications/in-app-notification-toast-state.test.ts src/lib/internal-action-url.test.ts src/lib/in-app-notification-queue.test.ts src/lib/in-app-notifications.test.ts src/lib/notification-bell-utils.test.ts
```

Output:

```text
TAP version 13
# Subtest: stays quiet when there is no active notification and the stream is not reconnecting
ok 1 - stays quiet when there is no active notification and the stream is not reconnecting
  ---
  duration_ms: 0.8795
  ...
# Subtest: shows reconnecting status even without an active notification
ok 2 - shows reconnecting status even without an active notification
  ---
  duration_ms: 0.417458
  ...
# Subtest: includes the active notification and queued count copy
ok 3 - includes the active notification and queued count copy
  ---
  duration_ms: 0.100042
  ...
# Subtest: shared surface props preserve live-region and pointer semantics for all renderer paths
ok 4 - shared surface props preserve live-region and pointer semantics for all renderer paths
  ---
  duration_ms: 0.094875
  ...
# Subtest: queues unread hydration oldest first and ignores duplicate replay
ok 5 - queues unread hydration oldest first and ignores duplicate replay
  ---
  duration_ms: 19.451834
  ...
# Subtest: hydrates by createdAt then id and filters read notifications
ok 6 - hydrates by createdAt then id and filters read notifications
  ---
  duration_ms: 0.172834
  ...
# Subtest: shown notifications are not requeued during reconnect hydration
ok 7 - shown notifications are not requeued during reconnect hydration
  ---
  duration_ms: 0.29275
  ...
# Subtest: clearQueuedInAppNotifications clears queued items but keeps active visible
ok 8 - clearQueuedInAppNotifications clears queued items but keeps active visible
  ---
  duration_ms: 0.204667
  ...
# Subtest: shown ids are preserved across removal and clear so replay is ignored
ok 9 - shown ids are preserved across removal and clear so replay is ignored
  ---
  duration_ms: 0.336416
  ...
# Subtest: a created event appends after hydrated unread messages
ok 10 - a created event appends after hydrated unread messages
  ---
  duration_ms: 0.117042
  ...
# Subtest: a dismiss event removes a queued notification
ok 11 - a dismiss event removes a queued notification
  ---
  duration_ms: 0.113834
  ...
# Subtest: advancing clears the active notification when nothing is queued
ok 12 - advancing clears the active notification when nothing is queued
  ---
  duration_ms: 0.114667
  ...
# Subtest: advancing and dismissing preserve FIFO order
ok 13 - advancing and dismissing preserve FIFO order
  ---
  duration_ms: 0.1825
  ...
# Subtest: a created event is inserted once when SSE reconnects and replays it
ok 14 - a created event is inserted once when SSE reconnects and replays it
  ---
  duration_ms: 1.339
  ...
# Subtest: hydrate replaces a notification dismissed while disconnected
ok 15 - hydrate replaces a notification dismissed while disconnected
  ---
  duration_ms: 0.103083
  ...
# Subtest: validated events buffered during hydration replay after replacement
ok 16 - validated events buffered during hydration replay after replacement
  ---
  duration_ms: 0.121417
  ...
# Subtest: read and dismiss events use their authoritative totals
ok 17 - read and dismiss events use their authoritative totals
  ---
  duration_ms: 8.534292
  ...
# Subtest: server unread total is preserved when the page is limited
ok 18 - server unread total is preserved when the page is limited
  ---
  duration_ms: 0.302541
  ...
# Subtest: read-all updates loaded rows for another tab
ok 19 - read-all updates loaded rows for another tab
  ---
  duration_ms: 0.154709
  ...
# Subtest: external action URLs are rejected by the client schema
ok 20 - external action URLs are rejected by the client schema
  ---
  duration_ms: 1.939041
  ...
# Subtest: accepts same-origin canonical paths
ok 21 - accepts same-origin canonical paths
  ---
  duration_ms: 48.834917
  ...
# Subtest: rejects redirect-like and encoded paths
ok 22 - rejects redirect-like and encoded paths
  ---
  duration_ms: 0.148583
  ...
# Subtest: relative time selects the unit using absolute seconds
ok 23 - relative time selects the unit using absolute seconds
  ---
  duration_ms: 49.129875
  ...
# Subtest: nested dismiss controls do not open the notification row
ok 24 - nested dismiss controls do not open the notification row
  ---
  duration_ms: 0.401959
  ...
1..24
# tests 24
# suites 0
# pass 24
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3227.55475
```

### Web lint

Command:

```bash
yarn lint
```

Output:

```text
src/hooks/use-in-app-notifications.ts:116:18: warning eslint(no-await-in-loop): Unexpected `await` inside a loop. help: Collect all promises into an array and use `Promise.all()` to run them in parallel, rather than awaiting each one sequentially inside the loop.
```

Result: exited successfully with the same pre-existing warning in `web/src/hooks/use-in-app-notifications.ts`.

### Type check

Command:

```bash
yarn exec tsc --noEmit
```

Output:

```text
(no output)
```

Result: exit code 0.
