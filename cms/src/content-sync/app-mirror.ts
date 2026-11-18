import { Pool, type PoolClient } from "pg";
import {
  mirrorTableFor,
  type MirrorColumnKind,
  type MirrorProjection,
  type SyncedCollection,
} from "./mappings";

type SyncOperation = "backfill" | "delete" | "upsert";

// Rows per staged INSERT during a backfill. Keeps the bound parameter count of
// a single statement well under Postgres' 65535 limit for any mapping.
const STAGE_CHUNK_SIZE = 500;

const STAGE_TABLE = "content_mirror_backfill_stage";

let pool: Pool | undefined;

// Exported so other writers into the app database — the matching publisher —
// share one pool rather than opening a second one per process.
export function getPool(): Pool {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.APP_MIRROR_DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "APP_MIRROR_DATABASE_URL is required to project Payload content into the app mirror.",
    );
  }

  pool = new Pool({
    connectionString,
    ssl:
      process.env.APP_MIRROR_DATABASE_SSL === "true"
        ? { rejectUnauthorized: false }
        : false,
  });

  return pool;
}

// Exported alongside `getPool` so every writer into the app database — mirror
// projections and matching publications alike — shares one rollback/release
// discipline instead of hand-rolling its own.
export async function withTransaction<T>(
  lockKey: string,
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    // Serialise writes per lock key. For mirror work that is the target table,
    // which prevents an older document job interleaving with a full
    // reconciliation; for a publication it is the one publication lock.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey]);
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function encode(kind: MirrorColumnKind, value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  // jsonb parameters must arrive as text and be cast; arrays are handled by the
  // driver directly.
  return kind === "jsonb" ? JSON.stringify(value) : value;
}

function castFor(kind: MirrorColumnKind, index: number): string {
  switch (kind) {
    case "jsonb":
      return `$${index}::jsonb`;
    case "integer":
      return `$${index}::integer`;
    case "text[]":
      return `$${index}::text[]`;
    default:
      return `$${index}`;
  }
}

interface RowBinding {
  expressions: string[];
  values: unknown[];
}

// Column order is shared by every statement below so the staging table and the
// target table always line up. Identifiers come from our own mappings, never
// from document content, so interpolating them is safe.
function columnsFor(projection: MirrorProjection): string[] {
  return [
    "sourceDocumentId",
    "sourceUpdatedAt",
    "publishedAt",
    ...Object.keys(projection.columns),
    "mirroredAt",
  ];
}

function bindRow(projection: MirrorProjection, startIndex: number): RowBinding {
  const expressions = [
    `$${startIndex}`,
    `$${startIndex + 1}::timestamptz`,
    `$${startIndex + 2}::timestamptz`,
  ];
  const values: unknown[] = [
    projection.sourceDocumentId,
    projection.sourceUpdatedAt,
    projection.publishedAt,
  ];
  let index = startIndex + 3;

  for (const [column, kind] of Object.entries(projection.columns)) {
    expressions.push(castFor(kind, index));
    values.push(encode(kind, projection.values[column]));
    index += 1;
  }

  expressions.push("now()");

  return { expressions, values };
}

function quote(columns: string[]): string {
  return columns.map((column) => `"${column}"`).join(", ");
}

function upsertAssignments(columns: string[]): string {
  return columns
    .filter((column) => column !== "sourceDocumentId")
    .map((column) => `"${column}" = EXCLUDED."${column}"`)
    .join(", ");
}

async function recordEvent(
  client: PoolClient,
  options: {
    collection: SyncedCollection;
    error?: string | null;
    jobId?: string | null;
    operation: SyncOperation;
    sourceDocumentId?: string | null;
    sourceUpdatedAt?: string | null;
    status: "failed" | "succeeded";
  },
): Promise<void> {
  await client.query(
    `INSERT INTO content_mirror_sync_events (
       "collection", "sourceDocumentId", "sourceUpdatedAt", "operation",
       "status", "payloadJobId", "error", "completedAt"
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
    [
      options.collection,
      options.sourceDocumentId ?? null,
      options.sourceUpdatedAt ?? null,
      options.operation,
      options.status,
      options.jobId ?? null,
      options.error ?? null,
    ],
  );
}

export async function upsertProjection(
  projection: MirrorProjection,
  jobId?: string,
): Promise<void> {
  const columns = columnsFor(projection);
  const { expressions, values } = bindRow(projection, 1);

  await withTransaction(projection.table, async (client) => {
    await client.query(
      `INSERT INTO ${projection.table} (${quote(columns)})
       VALUES (${expressions.join(", ")})
       ON CONFLICT ("sourceDocumentId") DO UPDATE SET ${upsertAssignments(columns)}`,
      values,
    );
    await recordEvent(client, {
      collection: projection.collection,
      jobId,
      operation: "upsert",
      sourceDocumentId: projection.sourceDocumentId,
      sourceUpdatedAt: projection.sourceUpdatedAt,
      status: "succeeded",
    });
  });
}

export async function deleteProjection(
  collection: SyncedCollection,
  sourceDocumentId: string,
  jobId?: string,
): Promise<void> {
  const table = mirrorTableFor(collection);

  await withTransaction(table, async (client) => {
    await client.query(`DELETE FROM ${table} WHERE "sourceDocumentId" = $1`, [
      sourceDocumentId,
    ]);
    await recordEvent(client, {
      collection,
      jobId,
      operation: "delete",
      sourceDocumentId,
      status: "succeeded",
    });
  });
}

export async function replaceCollection(
  collection: SyncedCollection,
  projections: MirrorProjection[],
  jobId?: string,
): Promise<void> {
  const table = mirrorTableFor(collection);

  await withTransaction(table, async (client) => {
    // The whole rebuild lands in one transaction, so readers keep seeing the
    // previous mirror until it commits.
    await client.query(
      `CREATE TEMP TABLE ${STAGE_TABLE} (LIKE ${table}) ON COMMIT DROP`,
    );

    for (
      let offset = 0;
      offset < projections.length;
      offset += STAGE_CHUNK_SIZE
    ) {
      const chunk = projections.slice(offset, offset + STAGE_CHUNK_SIZE);
      const rows: string[] = [];
      const values: unknown[] = [];

      for (const projection of chunk) {
        const binding = bindRow(projection, values.length + 1);
        rows.push(`(${binding.expressions.join(", ")})`);
        values.push(...binding.values);
      }

      await client.query(
        `INSERT INTO ${STAGE_TABLE} (${quote(columnsFor(chunk[0]))})
         VALUES ${rows.join(", ")}`,
        values,
      );
    }

    if (projections.length > 0) {
      const columns = columnsFor(projections[0]);

      await client.query(`
        INSERT INTO ${table} (${quote(columns)})
        SELECT ${quote(columns)} FROM ${STAGE_TABLE}
        ON CONFLICT ("sourceDocumentId") DO UPDATE SET ${upsertAssignments(columns)}
      `);
    }

    await client.query(`
      DELETE FROM ${table} AS mirror
      WHERE NOT EXISTS (
        SELECT 1
        FROM ${STAGE_TABLE} AS staged
        WHERE staged."sourceDocumentId" = mirror."sourceDocumentId"
      )
    `);
    await recordEvent(client, {
      collection,
      jobId,
      operation: "backfill",
      status: "succeeded",
    });
  });
}

export async function recordFailedSync(
  collection: SyncedCollection,
  operation: SyncOperation,
  error: unknown,
  sourceDocumentId?: string,
  jobId?: string,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);

  try {
    const client = await getPool().connect();

    try {
      await recordEvent(client, {
        collection,
        error: message,
        jobId,
        operation,
        sourceDocumentId,
        status: "failed",
      });
    } finally {
      client.release();
    }
  } catch {
    // If app Postgres itself is unavailable, Payload's durable job record still
    // captures the error and retries the projection.
  }
}
