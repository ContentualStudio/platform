import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import type { Payload } from "payload";
import { Pool } from "pg";
import {
  dedupeScopeTokens,
  effectTypeTokens,
  eventNameTokens,
} from "@contentual/content-engine-vocabulary";
import { backfillCollection, reconcileDocument, removeDocument } from "./sync";

// sync.ts orchestrates Payload reads, the published/draft decision, and error
// recording. It takes the Payload client as an argument, so these stub that
// client and let the real projection run against the app mirror.
//
//   APP_MIRROR_DATABASE_URL=postgresql://... yarn workspace @contentual/cms test
const connectionString = process.env.APP_MIRROR_DATABASE_URL;
const options = {
  skip: connectionString
    ? false
    : "APP_MIRROR_DATABASE_URL is not set; skipping content sync integration tests",
};

const pool = connectionString ? new Pool({ connectionString }) : undefined;

after(async () => {
  await pool?.end();
});

beforeEach(async () => {
  await pool?.query(
    `TRUNCATE programme, programme_modules, engine_rules, engine_badges, engine_call_types,
              content_mirror_sync_events`,
  );
});

interface FindCall {
  collection: string;
  where: unknown;
}

// Records what sync.ts asked Payload for, so the tests can assert on the query
// as well as the resulting rows.
function stubPayload(docs: unknown[], calls: FindCall[] = []): Payload {
  return {
    find: async (args: { collection: string; where: unknown }) => {
      calls.push({ collection: args.collection, where: args.where });
      return { docs };
    },
  } as unknown as Payload;
}

function failingPayload(message: string): Payload {
  return {
    find: async () => {
      throw new Error(message);
    },
  } as unknown as Payload;
}

function programmeDoc(overrides: Record<string, unknown> = {}) {
  return {
    _status: "published",
    description: null,
    id: 5,
    lessons: [],
    slug: "p-5",
    title: "Five",
    updatedAt: "2026-07-20T10:00:00.000Z",
    ...overrides,
  };
}

async function mirrorIds(): Promise<string[]> {
  const result = await pool!.query(
    `SELECT "sourceDocumentId" FROM programme ORDER BY 1`,
  );

  return result.rows.map((row) => row.sourceDocumentId);
}

async function events(): Promise<Record<string, unknown>[]> {
  const result = await pool!.query(
    `SELECT "operation", "status", "sourceDocumentId", "error"
     FROM content_mirror_sync_events ORDER BY id`,
  );

  return result.rows;
}

test("a published document is projected into the mirror", options, async () => {
  await reconcileDocument(stubPayload([programmeDoc()]), "programmes", "5");

  assert.deepEqual(await mirrorIds(), ["5"]);
});

test("unpublishing a document removes its mirror row", options, async () => {
  await reconcileDocument(stubPayload([programmeDoc()]), "programmes", "5");
  assert.deepEqual(await mirrorIds(), ["5"], "precondition: row is mirrored");

  // Payload keeps the document but flips it back to draft.
  await reconcileDocument(
    stubPayload([programmeDoc({ _status: "draft" })]),
    "programmes",
    "5",
  );

  assert.deepEqual(await mirrorIds(), [], "unpublish must remove the row");
  assert.equal((await events()).at(-1)?.operation, "delete");
});

test("a document that no longer exists is treated as a delete, not an error", options, async () => {
  await reconcileDocument(stubPayload([programmeDoc()]), "programmes", "5");

  // A queued publish can run after a later delete; the job must not fail
  // permanently on a not-found document.
  await reconcileDocument(stubPayload([]), "programmes", "5");

  assert.deepEqual(await mirrorIds(), []);
});

test("removeDocument deletes the row and records the outcome", options, async () => {
  await reconcileDocument(stubPayload([programmeDoc()]), "programmes", "5");

  await removeDocument("programmes", "5", "job-remove");

  assert.deepEqual(await mirrorIds(), []);
  const last = (await events()).at(-1);
  assert.equal(last?.operation, "delete");
  assert.equal(last?.status, "succeeded");
});

test("a failed projection records a failure and rethrows so the job retries", options, async () => {
  await assert.rejects(
    () => reconcileDocument(failingPayload("payload is down"), "programmes", "5", "job-fail"),
    /payload is down/,
    "the error must propagate so Payload retries the job",
  );

  const recorded = await events();
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].status, "failed");
  assert.equal(recorded[0].sourceDocumentId, "5");
  assert.match(String(recorded[0].error), /payload is down/);
});

test("backfill asks Payload only for published documents", options, async () => {
  const calls: FindCall[] = [];

  const count = await backfillCollection(
    stubPayload([programmeDoc(), programmeDoc({ id: 6, slug: "p-6" })], calls),
    "programmes",
  );

  assert.equal(count, 2);
  assert.deepEqual(await mirrorIds(), ["5", "6"]);
  assert.deepEqual(
    calls[0].where,
    { _status: { equals: "published" } },
    "drafts must be excluded at the query, not after projection",
  );
});

test("backfill removes rows whose source documents are gone", options, async () => {
  await backfillCollection(
    stubPayload([programmeDoc(), programmeDoc({ id: 6, slug: "p-6" })]),
    "programmes",
  );
  assert.deepEqual(await mirrorIds(), ["5", "6"]);

  await backfillCollection(stubPayload([programmeDoc()]), "programmes");

  assert.deepEqual(await mirrorIds(), ["5"]);
});

test("an unknown collection is rejected before any write", options, async () => {
  await assert.rejects(
    () => reconcileDocument(stubPayload([]), "not-a-collection", "1"),
    /Unsupported content mirror collection/,
  );
});

function ruleDoc(overrides: Record<string, unknown> = {}) {
  return {
    _status: "published",
    active: true,
    conditions: [],
    dedupeScope: dedupeScopeTokens.oncePerUser,
    description: null,
    effectType: effectTypeTokens.inAppMessage,
    id: 1,
    key: "rule-1",
    message: "Nice work",
    name: "Rule 1",
    triggerEvent: eventNameTokens.taskCompleted,
    updatedAt: "2026-07-21T09:00:00.000Z",
    ...overrides,
  };
}

async function ruleRows(): Promise<Record<string, unknown>[]> {
  const result = await pool!.query(
    `SELECT * FROM engine_rules ORDER BY "sourceDocumentId"`,
  );

  return result.rows;
}

test("a published inactive rule is mirrored rather than skipped", options, async () => {
  await reconcileDocument(
    stubPayload([ruleDoc({ active: false })]),
    "engine-rules",
    "1",
  );

  const stored = await ruleRows();
  assert.equal(stored.length, 1, "publication, not activation, decides mirroring");
  assert.equal(stored[0].active, false);
});

test("unpublishing a rule removes it from the mirror", options, async () => {
  await reconcileDocument(stubPayload([ruleDoc()]), "engine-rules", "1");
  assert.equal((await ruleRows()).length, 1, "precondition: rule is mirrored");

  await reconcileDocument(
    stubPayload([ruleDoc({ _status: "draft" })]),
    "engine-rules",
    "1",
  );

  assert.equal((await ruleRows()).length, 0);
});

test("a rule backfill reconstructs exactly what incremental sync wrote", options, async () => {
  const docs = [
    ruleDoc(),
    ruleDoc({
      active: false,
      badge: 7,
      effectType: effectTypeTokens.awardBadge,
      id: 2,
      key: "rule-2",
      message: null,
      name: "Rule 2",
    }),
  ];

  for (const doc of docs) {
    await reconcileDocument(stubPayload([doc]), "engine-rules", String(doc.id));
  }
  const incremental = await ruleRows();

  await pool!.query(`TRUNCATE engine_rules`);
  const count = await backfillCollection(stubPayload(docs), "engine-rules");

  // mirroredAt is write-time metadata, so it differs by construction.
  const comparable = (source: Record<string, unknown>[]) =>
    source.map((row) =>
      Object.fromEntries(
        Object.entries(row).filter(([column]) => column !== "mirroredAt"),
      ),
    );

  assert.equal(count, 2);
  assert.deepEqual(comparable(await ruleRows()), comparable(incremental));
});

test("catalogue entries reach the mirror through the same orchestration", options, async () => {
  for (const collection of ["engine-badges", "engine-call-types"] as const) {
    const table = collection.replace(/-/g, "_");
    const doc = {
      _status: "published",
      active: true,
      description: null,
      id: 1,
      key: "entry-1",
      name: "Entry",
      updatedAt: "2026-07-21T09:00:00.000Z",
    };

    await reconcileDocument(stubPayload([doc]), collection, "1");
    const stored = await pool!.query(`SELECT * FROM ${table}`);
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0].key, "entry-1");

    await removeDocument(collection, "1");
    assert.equal((await pool!.query(`SELECT * FROM ${table}`)).rows.length, 0);
  }
});
