import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  authIntentSchema,
  sendEmailCodeSchema,
  verifyEmailCodeSchema,
} from "./auth.schemas";

test("auth intent defaults to login so an omitted intent cannot create an account", () => {
  assert.equal(sendEmailCodeSchema.parse({ email: "a@b.com" }).intent, "login");
  assert.equal(
    verifyEmailCodeSchema.parse({ code: "123456", email: "a@b.com" }).intent,
    "login",
  );
});

test("auth intent rejects values other than login and signup", () => {
  assert.equal(authIntentSchema.parse("signup"), "signup");
  assert.equal(authIntentSchema.safeParse("register").success, false);
});

test("sendEmailCodeSchema normalizes email addresses", () => {
  const payload = sendEmailCodeSchema.parse({
    email: "  PERSON@Example.COM ",
  });

  assert.deepEqual(payload, {
    email: "person@example.com",
    intent: "login",
  });
});

test("verifyEmailCodeSchema accepts exactly six numeric OTP digits", () => {
  assert.deepEqual(
    verifyEmailCodeSchema.parse({
      code: "123456",
      email: "person@example.com",
    }),
    {
      code: "123456",
      email: "person@example.com",
      intent: "login",
    },
  );

  assert.throws(() =>
    verifyEmailCodeSchema.parse({
      code: "12345",
      email: "person@example.com",
    }),
  );

  assert.throws(() =>
    verifyEmailCodeSchema.parse({
      code: "abcdef",
      email: "person@example.com",
    }),
  );
});
