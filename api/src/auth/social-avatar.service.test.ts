import * as assert from "node:assert/strict";
import { test } from "node:test";
import { SocialAvatarService } from "./social-avatar.service";

const GOOGLE_URL = "https://lh3.googleusercontent.com/a/portrait=s96-c";

interface HarnessOptions {
  maxBytes?: number;
}

function imageResponse(
  body: Buffer,
  contentType = "image/jpeg",
  status = 200,
): Response {
  return new Response(body, {
    status,
    headers: { "content-type": contentType },
  });
}

function createHarness(options: HarnessOptions = {}) {
  const userWrites: Record<string, unknown>[] = [];
  const uploads: Record<string, unknown>[] = [];
  const warnings: string[] = [];

  const userRepository = {
    update: async (_where: unknown, values: Record<string, unknown>) => {
      userWrites.push(values);
    },
  };
  const avatarStore = {
    accepts: (contentType: string) =>
      ["image/jpeg", "image/png", "image/webp"].includes(contentType),
    maxSizeBytes: options.maxBytes ?? 5 * 1024 * 1024,
    save: async (input: Record<string, unknown>) => {
      uploads.push(input);
      return {
        url: "http://localhost:3001/profile/me/avatar?v=abc123",
        etag: "abc123",
      };
    },
  };

  const service = new SocialAvatarService(
    userRepository as never,
    avatarStore as never,
  );
  // The service logs rather than throwing, so the test asserts on what was
  // logged instead of letting Nest's logger write to the suite's output.
  Object.assign(service, {
    logger: { warn: (message: string) => warnings.push(message) },
  });

  return { service, userWrites, uploads, warnings };
}

async function withFetch<T>(
  impl: typeof fetch,
  run: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;

  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("stores a Google avatar and records both halves of the write", async () => {
  const harness = createHarness();
  const body = Buffer.from("jpeg-bytes");

  const url = await withFetch(
    async () => imageResponse(body),
    () =>
      harness.service.importForNewUser({ id: "user-1", image: GOOGLE_URL }),
  );

  assert.equal(url, "http://localhost:3001/profile/me/avatar?v=abc123");
  assert.deepEqual(harness.userWrites, [
    { image: "http://localhost:3001/profile/me/avatar?v=abc123" },
  ]);
  assert.equal(harness.uploads.length, 1);
  assert.equal(harness.uploads[0].contentType, "image/jpeg");
  assert.equal(harness.uploads[0].userId, "user-1");
  assert.ok(Buffer.isBuffer(harness.uploads[0].bytes));
});

test("leaves the provider URL alone when there is nothing to import", async () => {
  const harness = createHarness();

  const url = await harness.service.importForNewUser({
    id: "user-1",
    image: null,
  });

  assert.equal(url, null);
  assert.deepEqual(harness.userWrites, []);
});

test("refuses a host outside the allow list", async () => {
  const harness = createHarness();
  let fetched = false;

  const url = await withFetch(
    async () => {
      fetched = true;
      return imageResponse(Buffer.from("jpeg-bytes"));
    },
    () =>
      harness.service.importForNewUser({
        id: "user-1",
        image: "https://attacker.example.com/avatar.jpg",
      }),
  );

  assert.equal(url, null);
  assert.equal(fetched, false);
});

test("refuses a plain-http source", async () => {
  const harness = createHarness();

  const url = await harness.service.importForNewUser({
    id: "user-1",
    image: "http://lh3.googleusercontent.com/a/portrait",
  });

  assert.equal(url, null);
});

test("ignores a response that is not a supported image", async () => {
  const harness = createHarness();

  const url = await withFetch(
    async () => imageResponse(Buffer.from("<html>"), "text/html"),
    () =>
      harness.service.importForNewUser({ id: "user-1", image: GOOGLE_URL }),
  );

  assert.equal(url, null);
  assert.deepEqual(harness.userWrites, []);
});

test("ignores an image larger than the avatar limit", async () => {
  const harness = createHarness({ maxBytes: 4 });

  const url = await withFetch(
    async () => imageResponse(Buffer.alloc(64)),
    () =>
      harness.service.importForNewUser({ id: "user-1", image: GOOGLE_URL }),
  );

  assert.equal(url, null);
  assert.deepEqual(harness.userWrites, []);
});

test("ignores a failed download", async () => {
  const harness = createHarness();

  const url = await withFetch(
    async () => imageResponse(Buffer.alloc(0), "image/jpeg", 404),
    () =>
      harness.service.importForNewUser({ id: "user-1", image: GOOGLE_URL }),
  );

  assert.equal(url, null);
  assert.deepEqual(harness.userWrites, []);
});

test("swallows and logs a storage failure so signup still completes", async () => {
  const harness = createHarness();
  Object.assign(harness.service, {
    avatarStore: {
      accepts: () => true,
      maxSizeBytes: 5 * 1024 * 1024,
      save: async () => {
        throw new Error("the avatar could not be stored");
      },
    },
  });

  const url = await withFetch(
    async () => imageResponse(Buffer.from("jpeg-bytes")),
    () =>
      harness.service.importForNewUser({ id: "user-1", image: GOOGLE_URL }),
  );

  assert.equal(url, null);
  assert.equal(harness.warnings.length, 1);
  assert.match(harness.warnings[0], /the avatar could not be stored/);
});
