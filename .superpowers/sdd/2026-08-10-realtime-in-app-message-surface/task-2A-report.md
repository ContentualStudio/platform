# Task 2A Report

Date: 2026-08-10

## Summary

Implemented the Task 2A pending unread drain slice across API and web without changing the provider, toast, or bell surfaces.

## Files Changed

- `api/src/notifications/in-app-notification.types.ts`
- `api/src/notifications/notifications.controller.test.ts`
- `api/src/notifications/notifications.controller.ts`
- `api/src/notifications/notifications.in-app.service.test.ts`
- `api/src/notifications/notifications.schemas.ts`
- `api/src/notifications/notifications.service.ts`
- `web/src/hooks/use-in-app-notifications.test.ts`
- `web/src/hooks/use-in-app-notifications.ts`
- `web/src/schemas/notifications.schema.test.ts`
- `web/src/schemas/notifications.schema.ts`
- `web/src/services/notifications.service.test.ts`
- `web/src/services/notifications.service.ts`

## Red Evidence

### API red command

```bash
node --require ts-node/register --test src/notifications/notifications.in-app.service.test.ts src/notifications/notifications.controller.test.ts
```

Observed failures before implementation:

- `NotificationsController.getPendingInAppNotifications` did not exist
- `NotificationsService.listPendingInAppNotifications` did not exist

### Web red command

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","types":["node"]}' node --require ts-node/register --test src/services/notifications.service.test.ts src/schemas/notifications.schema.test.ts src/hooks/use-in-app-notifications.test.ts
```

Observed failures before implementation:

- `pendingInAppNotificationsResponseSchema` did not exist
- `fetchPendingInAppNotifications` did not exist
- `drainPendingInAppNotifications` did not exist
- pending rows were not folded into presentation hydration

## Green Evidence

### API green command

```bash
node --require ts-node/register --test src/notifications/notifications.in-app.service.test.ts src/notifications/notifications.controller.test.ts
```

Observed final output:

- `tests 9`
- `pass 9`
- `fail 0`
- exit code `0`

### Web green command

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","types":["node"]}' node --require ts-node/register --test src/services/notifications.service.test.ts src/schemas/notifications.schema.test.ts src/hooks/use-in-app-notifications.test.ts src/lib/in-app-notification-queue.test.ts src/lib/in-app-notifications.test.ts
```

Observed final output:

- `tests 26`
- `pass 26`
- `fail 0`
- exit code `0`

## Implementation Notes

- Added `GET /notifications/in-app/pending` with opaque cursor validation and oldest-first unread pagination.
- Kept the bounded inbox snapshot endpoint unchanged.
- Reused the existing in-app notification view mapping.
- Added web schema and service support for pending pages.
- Changed reconciliation to hold SSE events through snapshot plus pending drain, then replay in arrival order after a successful full reconciliation.
- Added repeated-cursor protection and failure handling that preserves current presentation state until a full drain succeeds.

## Reviewed Commit Hash

`2768d5a4e4d34953c4523becd7604fa8de491284`

## Concerns

- The API service treats a direct `null` cursor input as a terminal empty page for focused test symmetry; the HTTP contract still uses an omitted cursor for the first page and never needs a literal `null` query value.

## Fix Round 1

### Findings Addressed

- Added an independent retry scheduler for failed pending reconciliation while the same `EventSource` remains open.
- Added focused API coverage for 51+ eligible pending rows paged to `nextCursor === null`.
- Added focused web recovery coverage for 51+ pending rows, replay after the final pending page, and failed drain retention until retry success.
- Normalized malformed notification-query responses to the standard query error payload.

### Fix Round 1 Red Command

```bash
node --require ts-node/register --test src/notifications/notifications.in-app.service.test.ts src/notifications/notifications.controller.test.ts
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","types":["node"]}' node --require ts-node/register --test src/hooks/use-in-app-notifications.test.ts
```

Observed review-round failures before the fix:

- controller malformed-cursor response returned `INVALID_IN_APP_NOTIFICATION_QUERY` and cursor-specific text instead of the standard notification-query payload
- `reconcileInAppNotificationRecovery` helper was missing
- retry-scheduler helper was missing

### Fix Round 1 Green Commands

```bash
node --require ts-node/register --test src/notifications/notifications.in-app.service.test.ts src/notifications/notifications.controller.test.ts
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","types":["node"]}' node --require ts-node/register --test src/hooks/use-in-app-notifications.test.ts
```

Observed final output:

- API command: `tests 10`, `pass 10`, `fail 0`, exit code `0`
- Web hook command: `tests 7`, `pass 7`, `fail 0`, exit code `0`

### Fix Round 1 Files Changed

- `api/src/notifications/notifications.controller.test.ts`
- `api/src/notifications/notifications.controller.ts`
- `api/src/notifications/notifications.in-app.service.test.ts`
- `api/src/notifications/notifications.schemas.ts`
- `web/src/hooks/use-in-app-notifications.test.ts`
- `web/src/hooks/use-in-app-notifications.ts`

## Fix Round 2

### Finding Addressed

- Stopped scheduling the independent retry when the SSE stream is disconnected or reconnecting; the hook now retries independently only while the stream remains open after a pending reconciliation failure, and otherwise waits for the next `onopen`.

### Fix Round 2 Green Commands

```bash
node --require ts-node/register --test src/notifications/notifications.in-app.service.test.ts src/notifications/notifications.controller.test.ts
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","types":["node"]}' node --require ts-node/register --test src/services/notifications.service.test.ts src/schemas/notifications.schema.test.ts src/hooks/use-in-app-notifications.test.ts src/lib/in-app-notification-queue.test.ts src/lib/in-app-notifications.test.ts
```

Observed final output:

- API command: `tests 10`, `pass 10`, `fail 0`, exit code `0`
- Web command: `tests 29`, `pass 29`, `fail 0`, exit code `0`

### Fix Round 2 Files Changed

- `web/src/hooks/use-in-app-notifications.test.ts`
- `web/src/hooks/use-in-app-notifications.ts`
