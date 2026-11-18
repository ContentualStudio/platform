import { test } from "node:test";
import * as assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderArticleBody } from "../components/studio/studio-article";
import type { StudioLessonDetail } from "./studio-lesson";
function article(children: unknown[]): StudioLessonDetail {
  return {
    id: "article",
    slug: "article",
    title: "Article",
    summary: null,
    locked: false,
    minimumTier: "free",
    lessonType: "article",
    skillLevel: null,
    platforms: [],
    vimeoVideoId: null,
    templateUrl: null,
    body: { root: { type: "root", children } },
  };
}
function render(children: unknown[]) {
  return renderToStaticMarkup(
    createElement("div", null, renderArticleBody(article(children).body)),
  );
}
test("authored images, rules, checklists and text formats survive rendering", () => {
  const html = render([
    {
      type: "upload",
      relationTo: "media",
      value: {
        url: "https://cdn.example/diagram.png",
        alt: "Important diagram",
        mimeType: "image/png",
      },
    },
    { type: "horizontalrule" },
    {
      type: "paragraph",
      children: [
        { type: "text", text: "Changed", format: 4 },
        { type: "text", text: "2", format: 64 },
        { type: "text", text: "n", format: 32 },
      ],
    },
    {
      type: "list",
      listType: "check",
      children: [
        {
          type: "listitem",
          checked: true,
          children: [{ type: "text", text: "Done" }],
        },
      ],
    },
  ]);
  assert.match(html, /<img[^>]+src="https:\/\/cdn.example\/diagram.png"/);
  assert.match(html, /alt="Important diagram"/);
  assert.match(html, /<hr/);
  assert.match(html, /<s>Changed<\/s>/);
  assert.match(html, /<sup>2<\/sup>/);
  assert.match(html, /<sub>n<\/sub>/);
  assert.match(html, /type="checkbox"[^>]*checked/);
});
test("malformed nested article data returns the inline-error signal instead of throwing", () => {
  for (const children of [
    [null],
    [{ type: "paragraph", children: "bad" }],
    [{ type: "paragraph", children: [null] }],
  ]) {
    assert.equal(renderArticleBody(article(children).body), null);
  }
});
test("unknown content and unresolved uploads return the inline-error signal", () => {
  for (const children of [
    [{ type: "unknown-block" }],
    [{ type: "upload", value: "123" }],
  ])
    assert.equal(renderArticleBody(article(children).body), null);
});

test("Payload external and internal links preserve nullable relationship fields", () => {
  const html = render([
    {
      type: "paragraph",
      children: [
        {
          type: "link",
          fields: {
            doc: null,
            linkType: "custom",
            url: "https://example.com/resource",
            newTab: true,
          },
          children: [{ type: "text", text: "Resource" }],
        },
        {
          type: "link",
          fields: { doc: null, url: "mailto:hello@example.com" },
          children: [{ type: "text", text: "Email" }],
        },
        {
          type: "link",
          fields: {
            url: null,
            doc: {
              relationTo: "lessons",
              value: { id: 7, slug: "next-lesson", title: "Next lesson" },
            },
          },
          children: [{ type: "text", text: "Next" }],
        },
        {
          type: "link",
          fields: { doc: null, url: "javascript:alert(1)" },
          children: [{ type: "text", text: "Unsafe" }],
        },
      ],
    },
  ]);
  assert.match(html, /href="https:\/\/example.com\/resource"/);
  assert.match(html, /href="mailto:hello@example.com"/);
  assert.match(html, /href="\/studio\?lesson=next-lesson"/);
  assert.doesNotMatch(html, /javascript:/);
});
