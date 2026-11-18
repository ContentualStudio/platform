import assert from "node:assert/strict";
import test from "node:test";
import {
  displayNameFromProfile,
  greetingFirstName,
  isEmailDerivedName,
} from "./display-name";

test("email local-part matches are treated as email-derived names", () => {
  assert.equal(
    isEmailDerivedName("alexander.joshua2018", "alexander.joshua2018@gmail.com"),
    true,
  );
  assert.equal(
    isEmailDerivedName("Alexander.Joshua2018", "alexander.joshua2018@gmail.com"),
    true,
  );
});

test("real names are not treated as email-derived", () => {
  assert.equal(
    isEmailDerivedName("Alexander", "alexander.joshua2018@gmail.com"),
    false,
  );
  assert.equal(
    isEmailDerivedName("Alexander Joshua", "alexander.joshua2018@gmail.com"),
    false,
  );
});

test("greetingFirstName returns the first token of a real name", () => {
  assert.equal(
    greetingFirstName({
      email: "alexander.joshua2018@gmail.com",
      name: "Alexander Joshua",
    }),
    "Alexander",
  );
});

test("greetingFirstName is null for email-derived placeholders", () => {
  assert.equal(
    greetingFirstName({
      email: "alexander.joshua2018@gmail.com",
      name: "alexander.joshua2018",
    }),
    null,
  );
  assert.equal(displayNameFromProfile({ name: "alexander.joshua2018", email: "alexander.joshua2018@gmail.com" }), null);
});
