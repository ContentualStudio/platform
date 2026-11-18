import * as assert from "node:assert/strict";
import { test } from "node:test";

test("fetchPendingInAppNotifications URL-encodes the opaque cursor before requesting the next page", async () => {
  const calls: string[] = [];
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const originalFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";

  globalThis.fetch = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response(
      JSON.stringify({
        notifications: [],
        nextCursor: null,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const { fetchPendingInAppNotifications } = await import(
      "./notifications.service"
    );
    const response = await fetchPendingInAppNotifications("cursor+/=?");

    assert.deepEqual(response, {
      notifications: [],
      nextCursor: null,
    });
    assert.deepEqual(calls, [
      "https://api.example.test/notifications/in-app/pending?limit=50&cursor=cursor%2B%2F%3D%3F",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  }
});
