// Shared unit-test kit for Content Engine write paths.
//
// These fakes prove orchestration — which events, in what order, with what
// payload, and that dispatch never runs inside the fact transaction. They
// cannot prove an `ON CONFLICT ... DO NOTHING` gate, because the gate is SQL:
// that half of every domain's behaviour belongs in its integration suite.

// Throws with `name` in the message. Wire onto a fake's method so a code path
// that should never be reached on a given test fails loudly instead of
// silently returning `undefined`.
export function unreachable(name: string): () => never {
  return () => {
    throw new Error(`${name} must not be used on this path`);
  };
}

export interface EmittedEvent {
  readonly eventId: string;
  readonly eventName: string;
  readonly payload: unknown;
}

export interface FakeEmitter {
  readonly emitted: EmittedEvent[];
  emit: (
    manager: unknown,
    input: { eventId: string; eventName: string; payload: unknown },
  ) => Promise<{
    id: string;
    eventName: string;
    userId: string;
    payload: unknown;
  }>;
}

// Mirrors ContentEventEmitter.emit()'s success shape closely enough for
// callers that only read `.id` off the result, which is every write path in
// this repo.
export function fakeEmitter(options: { failWith?: string } = {}): FakeEmitter {
  const emitted: EmittedEvent[] = [];

  return {
    emitted,
    emit: async (_manager, input) => {
      if (options.failWith) {
        throw new Error(options.failWith);
      }

      emitted.push(input);

      return {
        id: input.eventId,
        eventName: input.eventName,
        userId: (input.payload as { userId: string }).userId,
        payload: input.payload,
      };
    },
  };
}

export interface FakeDispatcher {
  readonly dispatched: string[];
  readonly sawOpenTransaction: boolean;
  dispatch: (eventId: string) => Promise<{ eventId: string; delivered: boolean }>;
}

export function fakeDispatcher(
  options: {
    failFor?: (eventId: string) => boolean;
    isTransactionOpen?: () => boolean;
  } = {},
): FakeDispatcher {
  const dispatched: string[] = [];
  let sawOpenTransaction = false;

  return {
    dispatched,
    get sawOpenTransaction() {
      return sawOpenTransaction;
    },
    dispatch: async (eventId: string) => {
      // The assertion every new write path inherits: rule evaluation must
      // never run while the fact transaction that produced the event is
      // still open.
      if (options.isTransactionOpen?.()) {
        sawOpenTransaction = true;
      }

      dispatched.push(eventId);

      if (options.failFor?.(eventId)) {
        throw new Error(`dispatch failed for ${eventId}`);
      }

      return { eventId, delivered: true };
    },
  };
}

export interface QueryRoute {
  // Matched against the raw SQL text — a substring check is usually enough
  // (e.g. `sql.includes('INSERT INTO "programme_task_progress"')`).
  readonly match: (sql: string) => boolean;
  readonly handle: (sql: string, params: readonly unknown[]) => unknown;
}

// New write paths call `manager.query(sql, params)` directly rather than
// going through a repository, so the manager fake has to route raw SQL to a
// canned result the same way a real gate's `ON CONFLICT ... RETURNING` would.
// Routes are checked in order; the first match wins.
export function queryRouter(
  routes: readonly QueryRoute[],
): (sql: string, params?: readonly unknown[]) => Promise<unknown> {
  return async (sql, params = []) => {
    const route = routes.find((candidate) => candidate.match(sql));

    if (!route) {
      throw new Error(`No fake query route matches:\n${sql}`);
    }

    return route.handle(sql, params);
  };
}

export interface TransactionHarness<Manager> {
  readonly dataSource: {
    transaction: (work: (manager: Manager) => Promise<unknown>) => Promise<unknown>;
  };
  readonly manager: Manager;
  readonly isTransactionOpen: () => boolean;
}

// Wraps a caller-built manager fake in a `DataSource`-shaped `transaction()`
// that tracks whether it is currently open. Every write path opens exactly
// one transaction per call, so this is deliberately not reentrant.
export function createTransactionHarness<Manager>(
  manager: Manager,
): TransactionHarness<Manager> {
  let open = false;

  const dataSource = {
    transaction: async (work: (m: Manager) => Promise<unknown>) => {
      open = true;
      try {
        return await work(manager);
      } finally {
        open = false;
      }
    },
  };

  return {
    dataSource,
    manager,
    isTransactionOpen: () => open,
  };
}
