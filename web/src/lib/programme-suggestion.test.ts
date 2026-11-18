import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  dismissProgrammeSuggestionSchema,
  programmeSuggestionSchema,
} from "../schemas/programme-suggestion.schema";

const base = {
  id: "7",
  slug: "30-day-growth",
  title: "30 Day Growth",
  track: "grow",
  description: "The next step.",
};

test("a suggestion parses into the shape the CTA renders", () => {
  const suggestion = programmeSuggestionSchema.parse(base);

  assert.equal(suggestion.slug, "30-day-growth");
  assert.equal(suggestion.track, "grow");
});

test("no suggestion is a null answer, not a parse failure", () => {
  assert.equal(programmeSuggestionSchema.nullable().parse(null), null);
});

test("absent track and description parse, so the CTA can omit them", () => {
  const suggestion = programmeSuggestionSchema.parse({
    ...base,
    track: null,
    description: null,
  });

  assert.equal(suggestion.track, null);
  assert.equal(suggestion.description, null);
});

test("dismiss accepts only a suggestion id", () => {
  assert.ok(dismissProgrammeSuggestionSchema.safeParse({ id: "7" }).success);

  for (const id of ["", "0", "abc", "../eligible", "1234567890123456789"]) {
    assert.equal(
      dismissProgrammeSuggestionSchema.safeParse({ id }).success,
      false,
      `"${id}" must be refused`,
    );
  }
});
