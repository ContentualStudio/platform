import * as assert from "node:assert/strict";
import { test } from "node:test";
import { Observable } from "rxjs";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import { NotificationsController } from "./notifications.controller";

const user: AuthenticatedUser = {
  id: "user-1",
  email: "creator@example.com",
  image: null,
  name: "Creator",
  onboardingCompleted: true,
};

test("an SSE listener failure closes the HTTP response despite the heartbeat", async () => {
  const bus = {
    subscribe: () =>
      new Observable((subscriber) => {
        subscriber.next({ type: "heartbeat" });
        const timer = setImmediate(() => subscriber.error(new Error("listener failed")));
        return () => clearImmediate(timer);
      }),
  };
  const controller = new NotificationsController({} as never, bus as never);
  const response = {
    body: "",
    ended: false,
    write(chunk: string) {
      this.body += chunk;
    },
    end() {
      this.ended = true;
    },
  };
  const subscription = controller.streamInAppNotifications(user).subscribe({
    next: (event) => {
      response.write(`event: ${event.type}\ndata: ${event.data}\n\n`);
    },
    error: () => response.end(),
    complete: () => response.end(),
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.match(response.body, /event: heartbeat/);
  assert.equal(response.ended, true);
  assert.equal(subscription.closed, true);
  subscription.unsubscribe();
});
