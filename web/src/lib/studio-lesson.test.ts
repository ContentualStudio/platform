import { test } from "node:test";
import * as assert from "node:assert/strict";
import { safeContentUrl, vimeoPlayerUrl } from "./studio-lesson";

test("content URLs reject executable and protocol-relative links", () => {
  assert.equal(safeContentUrl("javascript:alert(1)"), null);
  assert.equal(safeContentUrl("//evil.example/file"), null);
  assert.equal(
    safeContentUrl("https://cdn.example/file.pdf"),
    "https://cdn.example/file.pdf",
  );
});
test("Vimeo embeds accept only video references and suppress branding", () => {
  assert.equal(vimeoPlayerUrl("not-a-video"), null);
  assert.equal(
    vimeoPlayerUrl("12345")?.includes("title=0&byline=0&portrait=0"),
    true,
  );
});
