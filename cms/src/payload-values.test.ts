import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { relationshipSourceId, trimmedText } from "./payload-values";

// The trust boundary both authoring validators cross. Payload delivers a
// relationship in more than one shape depending on request depth, and the
// difference between "the author picked nothing" and "depth 0 gave us a bare
// id" is the difference between refusing a publication and accepting it.
describe("relationshipSourceId", () => {
  it("reads a bare id, a numeric id and a populated document", () => {
    assert.equal(relationshipSourceId("abc"), "abc");
    assert.equal(relationshipSourceId(7), "7");
    assert.equal(relationshipSourceId({ id: "abc" }), "abc");
  });

  it("refuses an empty or unresolved selection", () => {
    assert.equal(relationshipSourceId(""), null);
    assert.equal(relationshipSourceId("   "), null);
    assert.equal(relationshipSourceId(null), null);
    assert.equal(relationshipSourceId(undefined), null);
    assert.equal(relationshipSourceId({}), null);
  });
});

describe("trimmedText", () => {
  it("returns a trimmed string", () => {
    assert.equal(trimmedText("  hello  "), "hello");
  });

  it("treats blank and non-string values as absent, never as empty", () => {
    assert.equal(trimmedText(""), null);
    assert.equal(trimmedText("   "), null);
    assert.equal(trimmedText(null), null);
    assert.equal(trimmedText(undefined), null);
    assert.equal(trimmedText(7), null);
  });
});
