import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { PublishedMatchingRule } from "@contentual/programme-matching-vocabulary";
import { getPool, withTransaction } from "../content-sync/app-mirror";
import {
  revalidateRulesForRestore,
  type MatchingValidationError,
  type ProgrammeTarget,
  type ProgrammeTargetLookup,
} from "./matching-authoring";
import {
  assertProgrammeTargetsEligible,
  assertProgrammeVersionIdsExist,
  materializeProgrammeVersions,
} from "./programme-version-publish";
import { PROGRAMME_MATCHING_PUBLICATION_LOCK } from "./publication-lock";

// One lock for every publication, restore and pointer swap. Two operators
// publishing at the same moment must not interleave into a version whose rules
// came from both drafts, and the active pointer must not be swapped by the
// loser after the winner committed.

export interface PublishMatchingSetupInput {
  sourceDocumentId: string;
  label: string;
  rules: readonly PublishedMatchingRule[];
  actor?: string | null;
  correlationId?: string | null;
  restoredFromVersionId?: string | null;
  programmeTargets: readonly ProgrammeTarget[];
}

export interface PublishedVersionSummary {
  setupVersionId: string;
  label: string;
  publishedAt: string;
  ruleCount: number;
  activeNormalRuleCount: number;
  fallbackProgrammeKey: string;
  restoredFromVersionId: string | null;
}

async function insertVersion(
  client: PoolClient,
  setupVersionId: string,
  input: PublishMatchingSetupInput,
): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO "programme_matching_setup_versions"
       ("setupVersionId", "sourceDocumentId", "label", "publishedAt",
        "publishedBy", "restoredFromVersionId")
     VALUES ($1, $2, $3, now(), $4, $5)
     RETURNING "publishedAt"`,
    [
      setupVersionId,
      input.sourceDocumentId,
      input.label,
      input.actor ?? null,
      input.restoredFromVersionId ?? null,
    ],
  );

  const publishedAt = (rows[0] as { publishedAt: Date }).publishedAt;
  return publishedAt.toISOString();
}

async function insertRules(
  client: PoolClient,
  setupVersionId: string,
  rules: readonly PublishedMatchingRule[],
): Promise<void> {
  // One statement per rule rather than a batched INSERT. A setup is a handful
  // of rules, and the per-row failure this produces names the offending rule in
  // the database error, which is what makes a constraint violation debuggable.
  for (const [position, rule] of rules.entries()) {
    await client.query(
      `INSERT INTO "programme_matching_rules"
         ("setupVersionId", "ruleId", "name", "programmeKey", "programmeVersionId",
          "active", "priority", "fallback", "explanation", "conditions", "position")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)`,
      [
        setupVersionId,
        rule.id,
        rule.name,
        rule.programmeKey,
        rule.programmeVersionId,
        rule.active,
        rule.priority,
        rule.fallback,
        rule.explanation,
        JSON.stringify(rule.conditions),
        position,
      ],
    );
  }
}

// Last, deliberately. Everything the new version needs is already written and
// constraint-checked by the time the pointer moves, so a failure anywhere above
// leaves the previous setup active and serving.
async function activate(
  client: PoolClient,
  setupVersionId: string,
  actor: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO "active_programme_matching_setup"
       ("id", "setupVersionId", "activatedAt", "activatedBy")
     VALUES (true, $1, now(), $2)
     ON CONFLICT ("id") DO UPDATE
       SET "setupVersionId" = EXCLUDED."setupVersionId",
           "activatedAt" = EXCLUDED."activatedAt",
           "activatedBy" = EXCLUDED."activatedBy"`,
    [setupVersionId, actor],
  );
}

async function recordPublicationAttempt(
  client: PoolClient,
  attempt: {
    sourceDocumentId: string;
    setupVersionId?: string | null;
    outcome: "published" | "rejected" | "failed";
    reasonCode?: string | null;
    errors?: readonly MatchingValidationError[];
    actor?: string | null;
    correlationId?: string | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO "matching_publication_attempts"
       ("sourceDocumentId", "setupVersionId", "outcome", "reasonCode",
        "errors", "actor", "correlationId")
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [
      attempt.sourceDocumentId,
      attempt.setupVersionId ?? null,
      attempt.outcome,
      attempt.reasonCode ?? null,
      JSON.stringify(attempt.errors ?? []),
      attempt.actor ?? null,
      attempt.correlationId ?? null,
    ],
  );
}

function summarise(
  setupVersionId: string,
  publishedAt: string,
  input: PublishMatchingSetupInput,
): PublishedVersionSummary {
  const fallback = input.rules.find((rule) => rule.fallback);

  return {
    setupVersionId,
    label: input.label,
    publishedAt,
    ruleCount: input.rules.length,
    activeNormalRuleCount: input.rules.filter(
      (rule) => rule.active && !rule.fallback,
    ).length,
    // Non-null by the time publication runs: the shared snapshot schema refuses
    // a setup without exactly one fallback, and validation precedes this call.
    fallbackProgrammeKey: fallback?.programmeKey ?? "",
    restoredFromVersionId: input.restoredFromVersionId ?? null,
  };
}

/**
 * Writes one immutable version and activates it, atomically.
 *
 * The whole snapshot — version row, every rule, and the pointer swap — is one
 * transaction, so a publication either replaces the live setup completely or
 * leaves the previous one untouched and serving. There is no partially applied
 * setup, and deliberately no per-document asynchronous mirror job: activation
 * is a decision an operator made, not eventual consistency.
 *
 * The caller validates first. This function's own failures are constraint
 * violations — a duplicate priority the validator missed, a rule id repeated —
 * which are recorded as a failed attempt and rethrown rather than swallowed.
 */
export async function publishMatchingSetup(
  input: PublishMatchingSetupInput,
): Promise<PublishedVersionSummary> {
  const setupVersionId = randomUUID();

  try {
    const publishedAt = await withTransaction(
      PROGRAMME_MATCHING_PUBLICATION_LOCK,
      async (client) => {
        await assertProgrammeTargetsEligible(client, input.programmeTargets);
        await materializeProgrammeVersions(client, input.programmeTargets);
        await assertProgrammeVersionIdsExist(
          client,
          input.rules.map((rule) => rule.programmeVersionId),
        );
        const at = await insertVersion(client, setupVersionId, input);
        await insertRules(client, setupVersionId, input.rules);
        await activate(client, setupVersionId, input.actor ?? null);
        await recordPublicationAttempt(client, {
          sourceDocumentId: input.sourceDocumentId,
          setupVersionId,
          outcome: "published",
          actor: input.actor,
          correlationId: input.correlationId,
        });

        return at;
      },
    );

    return summarise(setupVersionId, publishedAt, input);
  } catch (error) {
    await recordAttemptOnOwnConnection({
      sourceDocumentId: input.sourceDocumentId,
      outcome: "failed",
      reasonCode: "PUBLICATION_WRITE_FAILED",
      errors: [
        {
          field: "rules",
          ruleLabel: null,
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      actor: input.actor,
      correlationId: input.correlationId,
      // Swallowed: if the app database itself is unreachable this throws too,
      // and the caller's original error is the one worth surfacing.
    }).catch(() => undefined);

    throw error;
  }
}

// On its own connection, outside any publication transaction. That is the
// point: a failed attempt has to survive the rollback that erased everything
// else the attempt wrote, and a rejected one never opened a transaction at all.
async function recordAttemptOnOwnConnection(
  attempt: Parameters<typeof recordPublicationAttempt>[1],
): Promise<void> {
  const client = await getPool().connect();

  try {
    await recordPublicationAttempt(client, attempt);
  } finally {
    client.release();
  }
}

export async function recordRejectedAttempt(input: {
  sourceDocumentId: string;
  errors: readonly MatchingValidationError[];
  actor?: string | null;
  correlationId?: string | null;
}): Promise<void> {
  await recordAttemptOnOwnConnection({
    sourceDocumentId: input.sourceDocumentId,
    outcome: "rejected",
    reasonCode: "VALIDATION_FAILED",
    errors: input.errors,
    actor: input.actor,
    correlationId: input.correlationId,
  });
}

export interface PublishedVersionRecord {
  setupVersionId: string;
  label: string;
  publishedAt: string;
  publishedBy: string | null;
  restoredFromVersionId: string | null;
  active: boolean;
}

/** Published history, newest first, with the live version flagged. */
export async function listPublishedVersions(
  limit = 25,
): Promise<PublishedVersionRecord[]> {
  const client = await getPool().connect();

  try {
    const { rows } = await client.query(
      `SELECT version."setupVersionId", version."label", version."publishedAt",
              version."publishedBy", version."restoredFromVersionId",
              (pointer."setupVersionId" IS NOT NULL) AS "active"
       FROM "programme_matching_setup_versions" AS version
       LEFT JOIN "active_programme_matching_setup" AS pointer
         ON pointer."setupVersionId" = version."setupVersionId"
       ORDER BY version."publishedAt" DESC
       LIMIT $1`,
      [limit],
    );

    return (rows as Record<string, unknown>[]).map((row) => ({
      setupVersionId: String(row.setupVersionId),
      label: String(row.label),
      publishedAt: (row.publishedAt as Date).toISOString(),
      publishedBy: (row.publishedBy as string | null) ?? null,
      restoredFromVersionId:
        (row.restoredFromVersionId as string | null) ?? null,
      active: row.active === true,
    }));
  } finally {
    client.release();
  }
}

/** The rules of one published version, in authoring order. */
export async function readPublishedRules(
  setupVersionId: string,
): Promise<PublishedMatchingRule[]> {
  const client = await getPool().connect();

  try {
    const { rows } = await client.query(
      `SELECT "ruleId", "name", "programmeKey", "programmeVersionId",
              "active", "priority", "fallback", "explanation", "conditions"
       FROM "programme_matching_rules"
       WHERE "setupVersionId" = $1
       ORDER BY "position", "ruleId"`,
      [setupVersionId],
    );

    return (rows as Record<string, unknown>[]).map((row) => ({
      id: String(row.ruleId),
      name: String(row.name),
      programmeKey: String(row.programmeKey),
      programmeVersionId: String(row.programmeVersionId),
      active: row.active === true,
      priority: row.priority === null ? null : Number(row.priority),
      fallback: row.fallback === true,
      explanation: String(row.explanation),
      conditions: row.conditions as PublishedMatchingRule["conditions"],
    }));
  } finally {
    client.release();
  }
}

export class UnknownMatchingVersionError extends Error {}

// A version belongs to the setup document it was published from. Without this
// check a restore could be pointed at any version id in the table and activate
// a setup the operator never opened.
async function versionBelongsTo(
  setupVersionId: string,
  sourceDocumentId: string,
): Promise<boolean> {
  const client = await getPool().connect();

  try {
    const { rows } = await client.query(
      `SELECT 1 FROM "programme_matching_setup_versions"
       WHERE "setupVersionId" = $1 AND "sourceDocumentId" = $2`,
      [setupVersionId, sourceDocumentId],
    );

    return rows.length > 0;
  } finally {
    client.release();
  }
}

export type RestoreMatchingSetupResult =
  | { published: true; version: PublishedVersionSummary }
  | { published: false; errors: readonly MatchingValidationError[] };

/**
 * Restores an earlier version by publishing its rules as a *new* immutable
 * version and activating that.
 *
 * Reactivating the old row would be simpler and wrong: history has to stay
 * append-only, and an assignment that cites the restored version must keep
 * citing the version it was actually made under.
 *
 * A stored version is re-validated exactly as a first-time publication is. It
 * was valid when written, which is not the same as valid now: an answer may
 * have been renamed out of the vocabulary and a target programme may have been
 * retired since. Restoring blind would activate a setup that cannot match
 * anyone — the one outcome publication exists to prevent — so a version that no
 * longer holds up is refused, and the current setup keeps serving.
 */
export async function restoreMatchingSetup(input: {
  sourceDocumentId: string;
  setupVersionId: string;
  label: string;
  programmes: ProgrammeTargetLookup;
  actor?: string | null;
  correlationId?: string | null;
}): Promise<RestoreMatchingSetupResult> {
  if (!(await versionBelongsTo(input.setupVersionId, input.sourceDocumentId))) {
    throw new UnknownMatchingVersionError(
      `Matching setup version ${input.setupVersionId} does not belong to this setup.`,
    );
  }

  const stored = await readPublishedRules(input.setupVersionId);

  if (stored.length === 0) {
    throw new UnknownMatchingVersionError(
      `Matching setup version ${input.setupVersionId} has no rules to restore.`,
    );
  }

  const validation = await revalidateRulesForRestore(stored, input.programmes);

  if (!validation.valid) {
    await recordRejectedAttempt({
      sourceDocumentId: input.sourceDocumentId,
      errors: validation.errors,
      actor: input.actor,
      correlationId: input.correlationId,
    });

    return { published: false, errors: validation.errors };
  }

  const version = await publishMatchingSetup({
    sourceDocumentId: input.sourceDocumentId,
    label: input.label,
    rules: validation.rules,
    actor: input.actor,
    correlationId: input.correlationId,
    restoredFromVersionId: input.setupVersionId,
    programmeTargets: validation.programmeTargets,
  });

  return { published: true, version };
}
