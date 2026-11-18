import "reflect-metadata";
import * as assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Client } from "pg";
import databaseConfig from "../config/database.config";
import { assertDisposableTestDatabase } from "../database/test-database-guard";

const CHANNEL = "contentual_in_app_notifications";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const skip = testDatabaseUrl ? false : "TEST_DATABASE_URL is not set";

let listeners: Client[] = [];

function client() {
  return new Client({
    connectionString: testDatabaseUrl,
    ssl: databaseConfig().database.ssl
      ? { rejectUnauthorized: false }
      : false,
  });
}

before(async () => {
  if (skip) return;
  assertDisposableTestDatabase(testDatabaseUrl, databaseConfig().database.url);
  listeners = [client(), client()];
  await Promise.all(listeners.map((listener) => listener.connect()));
  await Promise.all(
    listeners.map((listener) => listener.query(`LISTEN ${CHANNEL}`)),
  );
});

after(async () => {
  await Promise.all(listeners.map((listener) => listener.end()));
  listeners = [];
});

function nextNotification(listener: Client): Promise<string> {
  return new Promise((resolve) => {
    const handler = (message: { channel: string; payload?: string }) => {
      if (message.channel !== CHANNEL) return;
      listener.off("notification", handler);
      resolve(message.payload ?? "");
    };
    listener.on("notification", handler);
  });
}

test("two LISTEN connections receive committed envelopes but not rolled-back ones", { skip }, async () => {
  const publisher = client();
  await publisher.connect();

  try {
    await publisher.query("BEGIN");
    await publisher.query(
      "SELECT pg_notify($1, $2)",
      [CHANNEL, JSON.stringify({ userId: "user-1", type: "heartbeat", unreadCount: 0 })],
    );
    await publisher.query("ROLLBACK");
    await new Promise((resolve) => setTimeout(resolve, 50));

    const committed = [nextNotification(listeners[0]), nextNotification(listeners[1])];
    await publisher.query("BEGIN");
    const payload = JSON.stringify({
      userId: "user-1",
      type: "notification.dismissed",
      notificationId: "n1",
      unreadCount: 0,
    });
    await publisher.query("SELECT pg_notify($1, $2)", [CHANNEL, payload]);
    await publisher.query("COMMIT");

    assert.deepEqual(await Promise.all(committed), [payload, payload]);
  } finally {
    await publisher.end();
  }
});
