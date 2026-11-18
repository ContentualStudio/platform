import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { ProgrammeTarget } from "./matching-authoring";

interface Queryable {
  query(
    sql: string,
    parameters?: unknown[],
  ): Promise<{ rows: unknown[] }>;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function programmeContentHash(target: ProgrammeTarget): string {
  return createHash("sha256")
    .update(canonicalJson(target.snapshot))
    .digest("hex");
}

export class ProgrammeVersionMaterializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProgrammeVersionMaterializationError";
  }
}

export async function assertProgrammeTargetsEligible(
  client: Queryable,
  targets: readonly ProgrammeTarget[],
): Promise<void> {
  const sourceDocumentIds = [
    ...new Set(targets.map((target) => target.sourceDocumentId)),
  ];

  for (const sourceDocumentId of sourceDocumentIds) {
    const { rows } = await client.query(
      `SELECT 1
       FROM "programme_matching_target_eligibility"
       WHERE "sourceDocumentId" = $1 AND "eligible" = true`,
      [sourceDocumentId],
    );

    if (rows.length === 0) {
      throw new ProgrammeVersionMaterializationError(
        `Programme ${sourceDocumentId} is no longer live and cannot be activated for matching.`,
      );
    }
  }
}

/**
 * Inserts every target before the matching setup can be activated.
 *
 * A version id is immutable. If a retry sees the same id, it is only accepted
 * when the source key and content hash still agree; silently replacing the JSON
 * would make a retry rewrite the content an old assignment reads.
 */
export async function materializeProgrammeVersions(
  client: PoolClient,
  targets: readonly ProgrammeTarget[],
): Promise<void> {
  const unique = new Map(
    targets.map((target) => [target.programmeVersionId, target]),
  );

  for (const target of unique.values()) {
    const hash = programmeContentHash(target);

    await client.query(
      `INSERT INTO "programme_content_versions"
         ("programmeVersionId", "programmeKey", "sourceDocumentId",
          "sourceUpdatedAt", "contentHash", "snapshot")
       VALUES ($1, $2, $3, $4::timestamptz, $5, $6::jsonb)
       ON CONFLICT ("programmeVersionId") DO NOTHING`,
      [
        target.programmeVersionId,
        target.programmeKey,
        target.sourceDocumentId,
        target.sourceUpdatedAt,
        hash,
        JSON.stringify(target.snapshot),
      ],
    );

    const { rows } = await client.query(
      `SELECT "programmeKey", "sourceDocumentId", "sourceUpdatedAt", "contentHash"
       FROM "programme_content_versions"
       WHERE "programmeVersionId" = $1`,
      [target.programmeVersionId],
    );
    const stored = rows[0] as
      | {
        programmeKey: string;
        sourceDocumentId: string;
        sourceUpdatedAt: Date | string;
        contentHash: string;
      }
      | undefined;

    if (
      !stored ||
      stored.programmeKey !== target.programmeKey ||
      stored.sourceDocumentId !== target.sourceDocumentId ||
      new Date(stored.sourceUpdatedAt).getTime() !==
        new Date(target.sourceUpdatedAt).getTime() ||
      stored.contentHash !== hash
    ) {
      throw new ProgrammeVersionMaterializationError(
        `Programme content version ${target.programmeVersionId} does not match the requested immutable snapshot.`,
      );
    }
  }
}

export async function assertProgrammeVersionIdsExist(
  client: PoolClient,
  programmeVersionIds: readonly string[],
): Promise<void> {
  const uniqueIds = [...new Set(programmeVersionIds)];

  for (const programmeVersionId of uniqueIds) {
    const { rows } = await client.query(
      `SELECT 1 FROM "programme_content_versions"
       WHERE "programmeVersionId" = $1`,
      [programmeVersionId],
    );

    if (rows.length === 0) {
      throw new ProgrammeVersionMaterializationError(
        `Programme content version ${programmeVersionId} has not been materialized.`,
      );
    }
  }
}
