import type { Logger } from "@nestjs/common";
import type { ContentEventDispatcher } from "./event-dispatcher";

// Collects the event IDs a write path emitted inside its fact transaction, so
// they can be dispatched once — and only once — after that transaction has
// committed. A plain accumulator rather than a queue: nothing here talks to
// the database, so it is safe to build and discard even on a path that
// ultimately emits nothing.
export class ContentEventBatch {
  private readonly ids: string[] = [];

  add(eventId: string): void {
    this.ids.push(eventId);
  }

  get eventIds(): readonly string[] {
    return this.ids;
  }
}

// Delivers a batch's events to the evaluator, in emit order, after the
// caller's transaction has resolved.
//
// Sequential and not `Promise.all`: preserves the cause-before-effect order
// the evaluator relies on (e.g. task.completed before week.completed), and
// does not fan one request out into N concurrent claim transactions.
//
// Every failure is logged and swallowed, never rethrown. The facts this batch
// describes are already committed; failing the request here would misreport
// them as failed. Each row stays `pending` and retryable by
// `dispatchPending()`.
export async function dispatchAfterCommit(
  dispatcher: ContentEventDispatcher,
  logger: Logger,
  ids: readonly string[],
): Promise<void> {
  for (const eventId of ids) {
    try {
      await dispatcher.dispatch(eventId);
    } catch (error) {
      logger.error(
        `Content Engine event ${eventId} remains pending`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
