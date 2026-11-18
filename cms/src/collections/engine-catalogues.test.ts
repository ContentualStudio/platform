import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionConfig, Field } from "payload";

import { EngineBadges } from "./EngineBadges";
import { EngineCallTypes } from "./EngineCallTypes";

const catalogues: ReadonlyArray<readonly [string, CollectionConfig]> = [
  ["engine-badges", EngineBadges],
  ["engine-call-types", EngineCallTypes],
];

function fieldNamed(collection: CollectionConfig, name: string) {
  const field = collection.fields.find(
    (candidate): candidate is Extract<Field, { name: string }> =>
      "name" in candidate && candidate.name === name,
  );

  assert.ok(field, `${collection.slug} is missing the ${name} field`);
  return field;
}

test("both catalogues use their expected slug and support drafts", () => {
  for (const [slug, collection] of catalogues) {
    assert.equal(collection.slug, slug);
    assert.ok(
      collection.versions &&
        typeof collection.versions === "object" &&
        collection.versions.drafts,
      `${slug} must keep drafts so publication gates the mirror`,
    );
  }
});

test("both catalogues expose an immutable unique key", () => {
  for (const [slug, collection] of catalogues) {
    const key = fieldNamed(collection, "key");

    assert.equal(key.type, "text");
    assert.equal(key.required, true);
    assert.equal("unique" in key && key.unique, true);
    assert.equal("index" in key && key.index, true);
    // The key is the mirror's stable handle, so a rename would silently orphan
    // every rule that points at this target. With drafts.autosave the row is
    // created before the key is filled in, so it stays editable while empty and
    // locks once set rather than being locked from creation.
    const update = key.access?.update as
      | ((args: { doc?: Record<string, unknown> }) => boolean)
      | undefined;
    assert.equal(
      update?.({ doc: {} }),
      true,
      `${slug} must let the key be set while it is empty`,
    );
    assert.equal(
      update?.({ doc: { key: "streak-7" } }),
      false,
      `${slug} must not allow the key to change once set`,
    );
  }
});

test("both catalogues carry name, description and an active flag", () => {
  for (const [, collection] of catalogues) {
    const name = fieldNamed(collection, "name");
    assert.equal(name.type, "text");
    assert.equal(name.required, true);

    assert.equal(fieldNamed(collection, "description").type, "textarea");

    const active = fieldNamed(collection, "active");
    assert.equal(active.type, "checkbox");
    assert.equal(active.required, true);
    assert.equal(active.defaultValue, true);
  }
});

test("both catalogues queue their own collection through the content sync hooks", async () => {
  for (const [slug, collection] of catalogues) {
    const afterChange = collection.hooks?.afterChange?.[0];
    const afterDelete = collection.hooks?.afterDelete?.[0];

    assert.ok(afterChange, `${slug} is missing the sync afterChange hook`);
    assert.ok(afterDelete, `${slug} is missing the sync afterDelete hook`);

    const queued: unknown[] = [];
    const req = {
      payload: { jobs: { queue: async (job: unknown) => queued.push(job) } },
    };

    await afterChange({
      doc: { _status: "published", id: 5 },
      previousDoc: { _status: "draft", id: 5 },
      req,
    } as never);
    await afterDelete({ id: 5, req } as never);

    assert.deepEqual(queued, [
      {
        input: { collection: slug, sourceDocumentId: "5" },
        queue: "content-mirror",
        task: "mirror-document",
      },
      {
        input: { collection: slug, sourceDocumentId: "5" },
        queue: "content-mirror",
        task: "remove-mirror-document",
      },
    ]);
  }
});
