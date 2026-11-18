import assert from "node:assert/strict";
import test from "node:test";
import type { Field } from "payload";

import { Lessons } from "./Lessons";
import { validateLessonBeforePublish } from "./content-validation";

function fieldNamed(name: string) {
  const field = Lessons.fields.find(
    (candidate): candidate is Extract<Field, { name: string }> =>
      "name" in candidate && candidate.name === name,
  );

  assert.ok(field, `Lessons is missing the ${name} field`);
  return field;
}

function selectValues(field: Extract<Field, { name: string }>): string[] {
  assert.equal(field.type, "select");
  const options = (field as { options?: Array<string | { value: string }> })
    .options;
  assert.ok(Array.isArray(options));
  return options.map((option) =>
    typeof option === "string" ? option : option.value,
  );
}

test("replaces the single PDF template with ordered media attachments", () => {
  const attachments = Lessons.fields.find(
    (candidate): candidate is Extract<Field, { name: string }> =>
      "name" in candidate && candidate.name === "attachments",
  );

  assert.ok(attachments);
  assert.equal(attachments.type, "relationship");
  assert.equal(attachments.relationTo, "media");
  assert.equal(attachments.hasMany, true);
  assert.equal(
    Lessons.fields.some(
      (candidate) => "name" in candidate && candidate.name === "pdfTemplate",
    ),
    false,
  );
});

test("defines every tag field with the closed vocabulary", () => {
  const lessonType = fieldNamed("lessonType");
  assert.equal(lessonType.type, "select");
  assert.equal((lessonType as { required?: boolean }).required, true);
  assert.deepEqual(selectValues(lessonType), [
    "article",
    "video",
    "masterclass",
    "template",
  ]);

  const skillLevel = fieldNamed("skillLevel");
  assert.deepEqual(selectValues(skillLevel), [
    "beginner",
    "intermediate",
    "advanced",
  ]);

  const platforms = fieldNamed("platforms");
  assert.equal(platforms.type, "select");
  assert.equal((platforms as { hasMany?: boolean }).hasMany, true);
  assert.deepEqual(selectValues(platforms), [
    "instagram",
    "youtube",
    "tiktok",
    "linkedin",
  ]);

  const contentType = fieldNamed("contentType");
  assert.deepEqual(selectValues(contentType), [
    "video",
    "photo",
    "caption",
    "story",
  ]);

  const programmeRelevance = fieldNamed("programmeRelevance");
  assert.equal(programmeRelevance.type, "relationship");
  assert.equal(programmeRelevance.relationTo, "programmes");
  assert.equal(
    (programmeRelevance as { hasMany?: boolean }).hasMany,
    true,
  );

  assert.equal(fieldNamed("programmeDayStart").type, "number");
  assert.equal(fieldNamed("programmeDayEnd").type, "number");
  assert.equal(fieldNamed("vimeoVideoId").type, "text");

  const templateFile = fieldNamed("templateFile");
  assert.equal(templateFile.type, "relationship");
  assert.equal(templateFile.relationTo, "media");
});

test("conditional body fields carry their admin.condition", () => {
  for (const name of ["body", "vimeoVideoId", "templateFile"]) {
    const field = fieldNamed(name);
    assert.equal(
      typeof (field as { admin?: { condition?: unknown } }).admin?.condition,
      "function",
      `${name} must carry an admin.condition`,
    );
  }

  const body = fieldNamed("body") as {
    admin?: { condition?: (data?: Record<string, unknown>) => boolean };
  };
  assert.equal(body.admin?.condition?.({ lessonType: "article" }), true);
  assert.equal(body.admin?.condition?.({ lessonType: "video" }), false);

  const vimeo = fieldNamed("vimeoVideoId") as {
    admin?: { condition?: (data?: Record<string, unknown>) => boolean };
  };
  assert.equal(vimeo.admin?.condition?.({ lessonType: "video" }), true);
  assert.equal(vimeo.admin?.condition?.({ lessonType: "masterclass" }), true);
  assert.equal(vimeo.admin?.condition?.({ lessonType: "article" }), false);

  const template = fieldNamed("templateFile") as {
    admin?: { condition?: (data?: Record<string, unknown>) => boolean };
  };
  assert.equal(template.admin?.condition?.({ lessonType: "template" }), true);
  assert.equal(template.admin?.condition?.({ lessonType: "article" }), false);
});

test("gates publication through the lesson validator", () => {
  const hooks = Lessons.hooks as {
    beforeValidate?: readonly unknown[];
  };
  assert.ok(
    hooks.beforeValidate?.includes(validateLessonBeforePublish),
    "Lessons must run validateLessonBeforePublish",
  );
});
