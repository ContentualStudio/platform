import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatPostDate,
  instagramPostsResponseSchema,
  postTitle,
  safeExternalUrl,
  type InstagramPost,
} from "./instagram-posts";

const post: InstagramPost = {
  id: "m1",
  mediaType: "REELS",
  permalink: "https://www.instagram.com/p/abc/",
  postedAt: "2026-10-07T18:30:00.000Z",
  caption: null,
  thumbnailUrl: null,
  views: 900,
  likes: null,
  comments: 3,
};

test("a post's title is its caption's first non-blank line", () => {
  assert.equal(
    postTitle({ ...post, caption: "\n  Morning routine  \nmore text" }),
    "Morning routine",
  );
});

test("a post without a caption is titled by its kind and date", () => {
  assert.equal(postTitle(post), "Reel · Oct 7");
  assert.equal(postTitle({ ...post, caption: "   " }), "Reel · Oct 7");
  assert.equal(
    postTitle({ ...post, mediaType: "SOMETHING_NEW", postedAt: null }),
    "Post",
  );
});

test("post dates are formatted as UTC calendar days", () => {
  assert.equal(formatPostDate("2026-10-07T23:59:00.000Z"), "Oct 7");
  assert.equal(formatPostDate(null), null);
});

test("only http(s) links are rendered", () => {
  assert.equal(safeExternalUrl("https://cdn.example/a.jpg"), "https://cdn.example/a.jpg");
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalUrl("not a url"), null);
  assert.equal(safeExternalUrl(null), null);
});

test("the response schema keeps absent metrics as null", () => {
  const parsed = instagramPostsResponseSchema.parse({
    connected: true,
    recent: [post],
    top: [],
  });

  assert.ok(parsed.connected);
  assert.equal(parsed.recent[0]?.likes, null);
  assert.deepEqual(instagramPostsResponseSchema.parse({ connected: false }), {
    connected: false,
  });
});
