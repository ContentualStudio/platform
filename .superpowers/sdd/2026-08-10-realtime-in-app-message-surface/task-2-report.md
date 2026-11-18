# Task 2 implementation report

## Summary

Implemented the Task 2 shared in-app notification hook slice with strict TDD:

- extended focused queue tests first
- added focused hook-owned presentation helper tests first
- verified red before implementation
- implemented the minimal queue + hook changes
- re-ran the focused queue/reducer tests to green
- re-ran the full `web` test suite to green before commit

## Files changed

- `web/src/hooks/use-in-app-notifications.ts`
- `web/src/hooks/use-in-app-notifications.test.ts`
- `web/src/lib/in-app-notification-queue.ts`
- `web/src/lib/in-app-notification-queue.test.ts`
- `.superpowers/sdd/2026-08-10-realtime-in-app-message-surface/task-2-report.md`

## Commit

- `6dea2b28120c48cf60514d154bbc418e985941ad`

## Red phase

### Queue regression red

Command:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","types":["node"]}' node --require ts-node/register --test src/lib/in-app-notification-queue.test.ts
```

Output excerpt:

```text
# Subtest: advancing clears the active notification when nothing is queued
not ok 8 - advancing clears the active notification when nothing is queued
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    + { ... id: 'oldest' ... }
    - null
```

Result: red, as expected. The queue could not advance past a lone active notification, which would have trapped `completeActiveNotification()` on the last toast.

### Hook presentation helper red

Command:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","types":["node"]}' node --require ts-node/register --test src/hooks/use-in-app-notifications.test.ts
```

Output excerpt:

```text
# Subtest: hydrateInAppNotificationPresentation enqueues only unread rows oldest first
not ok 1 - hydrateInAppNotificationPresentation enqueues only unread rows oldest first
  error: 'hydrateInAppNotificationPresentation should be exposed for focused presentation tests'
# Subtest: applyInAppNotificationPresentationEvent shares the created and read-all lifecycle rules
not ok 2 - applyInAppNotificationPresentationEvent shares the created and read-all lifecycle rules
  error: 'applyInAppNotificationPresentationEvent should be exposed for focused presentation tests'
```

Result: red, as expected. The shared hook did not yet expose or implement the pure presentation lifecycle helpers needed for authoritative hydration and the unified stream path.

## Green phase

### Focused hook helper tests

Command:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","types":["node"]}' node --require ts-node/register --test src/hooks/use-in-app-notifications.test.ts
```

Output:

```text
TAP version 13
# Subtest: hydrateInAppNotificationPresentation enqueues only unread rows oldest first
ok 1 - hydrateInAppNotificationPresentation enqueues only unread rows oldest first
# Subtest: applyInAppNotificationPresentationEvent shares the created and read-all lifecycle rules
ok 2 - applyInAppNotificationPresentationEvent shares the created and read-all lifecycle rules
1..2
# tests 2
# pass 2
# fail 0
```

### Focused queue/reducer verification from the brief

Command:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","types":["node"]}' node --require ts-node/register --test src/lib/in-app-notification-queue.test.ts src/lib/in-app-notifications.test.ts
```

Output excerpt:

```text
TAP version 13
# Subtest: queues unread hydration oldest first and ignores duplicate replay
ok 1 - queues unread hydration oldest first and ignores duplicate replay
# Subtest: a created event appends after hydrated unread messages
ok 6 - a created event appends after hydrated unread messages
# Subtest: advancing clears the active notification when nothing is queued
ok 8 - advancing clears the active notification when nothing is queued
# Subtest: read-all updates loaded rows for another tab
ok 15 - read-all updates loaded rows for another tab
1..16
# tests 16
# pass 16
# fail 0
```

### Full `web` verification before commit

Command:

```bash
npm test
```

Output excerpt:

```text
TAP version 13
...
1..48
# tests 48
# pass 48
# fail 0
```

## Behavior implemented

- The shared hook now returns:
  - `activeNotification`
  - `queuedNotificationCount`
  - `completeActiveNotification()`
  - `dismissActiveNotification()`
- Hydration still replaces the inbox authoritatively, then enqueues unread rows for presentation.
- Live and buffered SSE events now both flow through one `applyStreamEvent` path for inbox + presentation updates.
- Presentation queue lifecycle is local-first:
  - active notifications are marked shown immediately
  - unread actives trigger `markRead()` without blocking presentation
  - `completeActiveNotification()` advances locally
  - `dismissActiveNotification()` advances locally before awaiting the dismiss API
- The queue now correctly clears the final active notification when there is nothing left to promote.
- Existing reducer semantics were preserved:
  - hydrate replacement
  - buffered replay after authoritative replacement
  - authoritative unread totals
  - cross-tab `read_all`

## Concerns

- Task 2 intentionally stops short of the toast provider, pending recovery endpoint, and bell changes requested for later tasks.
- The active toast remains visible after `notifications.read_all`, which matches the Task 2 contract; the shared queue only clears queued follow-ups.
- The new hook tests are pure helper tests rather than a DOM-rendered hook harness. The full `web` suite and focused queue/reducer coverage are green, but renderer-level toast behavior remains for later task coverage.

## Round 1 fix report

### Review finding

`hydrateInAppNotificationPresentation()` appended unread hydrated rows onto the existing presentation queue during reconnect hydration, so stale active and queued toasts could survive an authoritative hydrate when the server no longer returned those rows.

### Files changed

- `web/src/hooks/use-in-app-notifications.ts`
- `web/src/hooks/use-in-app-notifications.test.ts`
- `.superpowers/sdd/2026-08-10-realtime-in-app-message-surface/task-2-report.md`

### Red phase

Command:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","types":["node"]}' node --require ts-node/register --test src/hooks/use-in-app-notifications.test.ts
```

Output excerpt:

```text
# Subtest: hydrateInAppNotificationPresentation replaces stale presentation rows on authoritative reconnect hydrate
not ok 2 - hydrateInAppNotificationPresentation replaces stale presentation rows on authoritative reconnect hydrate
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    + 'stale-active'
    - 'authoritative-oldest'
```

Result: red, as expected. The stale active toast survived hydrate instead of being replaced by the authoritative unread rows.

### Focused fix verification

Command:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","types":["node"]}' node --require ts-node/register --test src/hooks/use-in-app-notifications.test.ts src/lib/in-app-notification-queue.test.ts src/lib/in-app-notifications.test.ts
```

Output:

```text
TAP version 13
# Subtest: hydrateInAppNotificationPresentation enqueues only unread rows oldest first
ok 1 - hydrateInAppNotificationPresentation enqueues only unread rows oldest first
# Subtest: hydrateInAppNotificationPresentation replaces stale presentation rows on authoritative reconnect hydrate
ok 2 - hydrateInAppNotificationPresentation replaces stale presentation rows on authoritative reconnect hydrate
# Subtest: applyInAppNotificationPresentationEvent shares the created and read-all lifecycle rules
ok 3 - applyInAppNotificationPresentationEvent shares the created and read-all lifecycle rules
...
1..19
# tests 19
# pass 19
# fail 0
```

### Full web verification before commit

Command:

```bash
npm test
```

Output excerpt:

```text
TAP version 13
...
1..49
# tests 49
# pass 49
# fail 0
```

### Fix implemented

- Reconnect hydration now rebuilds presentation state from the authoritative response instead of appending onto stale queue state.
- `shownIds` are preserved across hydrate so reconnect dedupe still works.
- The current active toast is retained only when its id is still present in the authoritative hydrate response.
- Queued presentation rows are cleared and rebuilt from unread hydrated rows in oldest-first order.
