import * as assert from "node:assert/strict";
import { Logger } from "@nestjs/common";
import { test } from "node:test";
import { ContentEventBatch, dispatchAfterCommit } from "./event-batch";

function silentLogger(): Logger {
  const logger = new Logger("test");
  logger.error = () => undefined;
  return logger;
}

test("ContentEventBatch collects event IDs in add order", () => {
  const batch = new ContentEventBatch();

  batch.add("a");
  batch.add("b");
  batch.add("c");

  assert.deepEqual(batch.eventIds, ["a", "b", "c"]);
});

test("dispatchAfterCommit dispatches every ID in emit order", async () => {
  const dispatched: string[] = [];
  const dispatcher = {
    dispatch: async (eventId: string) => {
      dispatched.push(eventId);
      return { eventId, delivered: true };
    },
  };

  await dispatchAfterCommit(dispatcher as never, silentLogger(), ["a", "b", "c"]);

  assert.deepEqual(dispatched, ["a", "b", "c"]);
});

test("a failed dispatch is logged and does not stop the remaining events", async () => {
  const dispatched: string[] = [];
  const errors: string[] = [];
  const logger = new Logger("test");
  logger.error = (message: unknown) => {
    errors.push(String(message));
  };

  const dispatcher = {
    dispatch: async (eventId: string) => {
      dispatched.push(eventId);
      if (eventId === "b") {
        throw new Error("evaluator is not registered");
      }
      return { eventId, delivered: true };
    },
  };

  await dispatchAfterCommit(dispatcher as never, logger, ["a", "b", "c"]);

  assert.deepEqual(dispatched, ["a", "b", "c"]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /b/);
});

test("dispatchAfterCommit never rethrows", async () => {
  const dispatcher = {
    dispatch: async () => {
      throw new Error("outbox unavailable");
    },
  };

  await assert.doesNotReject(() =>
    dispatchAfterCommit(dispatcher as never, silentLogger(), ["a"]),
  );
});
