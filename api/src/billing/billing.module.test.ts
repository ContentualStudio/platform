import * as assert from "node:assert/strict";
import { test } from "node:test";
import { selectStripeGateway } from "./billing.module";

const config = (configured: boolean) =>
  ({ get: (key: string) => (key === "billing.configured" ? configured : undefined) }) as never;

test("the SDK gateway binds only when Stripe is configured; the stub otherwise", () => {
  const sdk = { kind: "sdk" } as never;
  const stub = { kind: "stub" } as never;

  assert.equal(selectStripeGateway(config(true), sdk, stub), sdk);
  assert.equal(selectStripeGateway(config(false), sdk, stub), stub);
});
