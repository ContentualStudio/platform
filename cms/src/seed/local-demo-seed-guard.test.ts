import assert from "node:assert/strict";
import test from "node:test";

import { assertLocalDemoSeedEnvironment } from "./local-demo-seed-guard";

const localEnvironment = {
  ALLOW_LOCAL_DEMO_SEED: "true",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/contentual_payload",
  APP_MIRROR_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/contentual",
  NODE_ENV: "development",
};

test("accepts an explicitly enabled seed when both databases are local", () => {
  assert.doesNotThrow(() => assertLocalDemoSeedEnvironment(localEnvironment));
});

test("requires explicit local-demo seed acknowledgement", () => {
  assert.throws(
    () =>
      assertLocalDemoSeedEnvironment({
        ...localEnvironment,
        ALLOW_LOCAL_DEMO_SEED: undefined,
      }),
    /ALLOW_LOCAL_DEMO_SEED=true/,
  );
});

test("refuses a remote Payload database", () => {
  assert.throws(
    () =>
      assertLocalDemoSeedEnvironment({
        ...localEnvironment,
        DATABASE_URL: "postgresql://user:secret@dev.example.com:5432/contentual_payload",
      }),
    /DATABASE_URL must point to localhost/,
  );
});

test("refuses a remote app mirror database", () => {
  assert.throws(
    () =>
      assertLocalDemoSeedEnvironment({
        ...localEnvironment,
        APP_MIRROR_DATABASE_URL:
          "postgresql://user:secret@dev.example.com:5432/contentual",
      }),
    /APP_MIRROR_DATABASE_URL must point to localhost/,
  );
});

test("refuses production mode even with local-looking URLs", () => {
  assert.throws(
    () =>
      assertLocalDemoSeedEnvironment({
        ...localEnvironment,
        NODE_ENV: "production",
      }),
    /NODE_ENV=production/,
  );
});
