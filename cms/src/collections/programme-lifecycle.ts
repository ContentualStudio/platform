import type {
  CollectionAfterChangeHook,
  CollectionAfterErrorHook,
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeOperationHook,
  Payload,
} from "payload";
import { withTransaction } from "../content-sync/app-mirror";
import { PROGRAMME_MATCHING_PUBLICATION_LOCK } from "../matching/publication-lock";

interface Queryable {
  query(
    sql: string,
    parameters?: unknown[],
  ): Promise<{ rows: unknown[] }>;
}

type ProgrammeLifecycle = "archived" | "draft" | "live" | "retired";

const nextLifecycle: Record<ProgrammeLifecycle, ProgrammeLifecycle | null> = {
  draft: "live",
  live: "retired",
  retired: "archived",
  archived: null,
};

function lifecycle(value: unknown): ProgrammeLifecycle | undefined {
  return value === "draft" ||
    value === "live" ||
    value === "retired" ||
    value === "archived"
    ? value
    : undefined;
}

function assertLifecycleTransition(previous: unknown, requested: unknown): void {
  const from = lifecycle(previous);
  const to = lifecycle(requested);

  if (!from || !to || from === to) {
    return;
  }

  if (nextLifecycle[from] !== to) {
    throw new Error(`Programme lifecycle cannot transition from ${from} to ${to}.`);
  }
}

interface LifecycleChange {
  enteringArchived: boolean;
  leavingEligible: boolean;
  publicationStatus: string;
  requested: ProgrammeLifecycle;
}

interface ProgrammeState {
  _status?: unknown;
  id?: unknown;
  lifecycleStatus?: unknown;
}

const ROLLBACK_CONTEXT_KEY = "programmeMatchingEligibilityRollback";
const OPERATION_CONTEXT_KEY = "programmeMatchingPayloadOperation";

interface ProgrammeOperationContext {
  savingDraft: boolean;
  unpublishing: boolean;
}

interface EligibilityRollback {
  lifecycleStatus?: ProgrammeLifecycle;
  publicationStatus?: string;
  remove?: boolean;
  sourceDocumentId: string;
}

function publicationStatus(value: unknown): string {
  return value === "published" ? "published" : "draft";
}

export function programmeIsEligibleForMatching(
  lifecycleStatus: unknown,
  status: unknown,
): boolean {
  return lifecycleStatus === "live" && status === "published";
}

export function programmeAvailabilityChange(
  previous: ProgrammeState,
  requested: ProgrammeState,
  unpublishing = false,
): LifecycleChange | null {
  const previousLifecycle = lifecycle(previous.lifecycleStatus);
  const requestedLifecycle =
    lifecycle(requested.lifecycleStatus) ?? previousLifecycle;
  assertLifecycleTransition(previousLifecycle, requestedLifecycle);

  if (!requestedLifecycle) {
    return null;
  }

  const previousPublication = publicationStatus(previous._status);
  const requestedPublication = unpublishing
    ? "draft"
    : requested._status === "published"
      ? "published"
      : previousPublication;

  return {
    requested: requestedLifecycle,
    publicationStatus: requestedPublication,
    leavingEligible:
      programmeIsEligibleForMatching(
        previousLifecycle,
        previousPublication,
      ) &&
      !programmeIsEligibleForMatching(
        requestedLifecycle,
        requestedPublication,
      ),
    enteringArchived:
      requestedLifecycle === "archived" && previousLifecycle !== "archived",
  };
}

export async function updateProgrammeEligibility(
  queryable: Queryable,
  sourceDocumentId: string,
  lifecycleStatus: string,
  status: string,
): Promise<void> {
  await queryable.query(
    `INSERT INTO "programme_matching_target_eligibility"
       ("sourceDocumentId", "lifecycleStatus", "publicationStatus", "eligible", "updatedAt")
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT ("sourceDocumentId") DO UPDATE SET
       "lifecycleStatus" = EXCLUDED."lifecycleStatus",
       "publicationStatus" = EXCLUDED."publicationStatus",
       "eligible" = EXCLUDED."eligible",
       "updatedAt" = now()`,
    [
      sourceDocumentId,
      lifecycleStatus,
      status,
      programmeIsEligibleForMatching(lifecycleStatus, status),
    ],
  );
}

export async function reconcileProgrammeEligibilityRows(
  queryable: Queryable,
  documents: ProgrammeState[],
): Promise<void> {
  const sourceDocumentIds: string[] = [];

  for (const document of documents) {
    const sourceDocumentId = String(document.id);
    const status = lifecycle(document.lifecycleStatus) ?? "draft";
    sourceDocumentIds.push(sourceDocumentId);
    await updateProgrammeEligibility(
      queryable,
      sourceDocumentId,
      status,
      publicationStatus(document._status),
    );
  }

  await queryable.query(
    `UPDATE "programme_matching_target_eligibility"
     SET "lifecycleStatus" = 'deleted',
         "publicationStatus" = 'draft',
         "eligible" = false,
         "updatedAt" = now()
     WHERE NOT ("sourceDocumentId" = ANY($1::text[]))`,
    [sourceDocumentIds],
  );
}

async function allProgrammeDocuments(payload: Payload): Promise<ProgrammeState[]> {
  const documents: ProgrammeState[] = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = await payload.find({
      collection: "programmes",
      depth: 0,
      draft: false,
      limit: 100,
      overrideAccess: true,
      page,
    });
    documents.push(...(result.docs as ProgrammeState[]));
    hasNextPage = result.hasNextPage;
    page += 1;
  }

  return documents;
}

export const captureProgrammeOperation: CollectionBeforeOperationHook = ({
  args,
  context,
}) => {
  const operationArgs = args as {
    draft?: boolean;
    unpublishAllLocales?: boolean | string;
  };
  context[OPERATION_CONTEXT_KEY] = {
    savingDraft: Boolean(operationArgs.draft),
    unpublishing:
      operationArgs.unpublishAllLocales === true ||
      operationArgs.unpublishAllLocales === "true",
  } satisfies ProgrammeOperationContext;
};

function programmeOperation(
  context?: Record<string, unknown>,
): ProgrammeOperationContext {
  return (
    (context?.[OPERATION_CONTEXT_KEY] as ProgrammeOperationContext | undefined) ?? {
      savingDraft: false,
      unpublishing: false,
    }
  );
}

async function publishedProgramme(
  payload: Payload,
  id: unknown,
): Promise<ProgrammeState | null> {
  const result = await payload.find({
    collection: "programmes",
    depth: 0,
    draft: false,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { id: { equals: id } },
  });

  return (result.docs[0] as ProgrammeState | undefined) ?? null;
}

export async function reconcileProgrammeEligibility(
  payload: Payload,
): Promise<void> {
  if (!process.env.APP_MIRROR_DATABASE_URL) {
    return;
  }

  const documents = await allProgrammeDocuments(payload);
  await withTransaction(
    PROGRAMME_MATCHING_PUBLICATION_LOCK,
    async (client) => reconcileProgrammeEligibilityRows(client, documents),
  );
}

export async function assertProgrammeNotTargetedByActiveMatching(
  queryable: Queryable,
  sourceDocumentId: string,
): Promise<void> {
  const { rows } = await queryable.query(
    `SELECT 1
     FROM "active_programme_matching_setup" pointer
     JOIN "programme_matching_rules" rule
       ON rule."setupVersionId" = pointer."setupVersionId"
     JOIN "programme_content_versions" version
       ON version."programmeVersionId" = rule."programmeVersionId"
     WHERE version."sourceDocumentId" = $1
       AND (rule."active" = true OR rule."fallback" = true)
     LIMIT 1`,
    [sourceDocumentId],
  );

  if (rows.length > 0) {
    throw new Error(
      "This programme is targeted by the active matching setup and must be removed from matching before it can leave live.",
    );
  }
}

export const preventProgrammeKeyChange: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
}) => {
  const existing = originalDoc?.key;
  const requested = data.key;

  if (
    typeof existing === "string" &&
    existing.trim() &&
    requested !== undefined &&
    requested !== existing
  ) {
    throw new Error("The permanent programme key cannot be changed.");
  }

  return data;
};

export async function assertProgrammeHasNoAssignments(
  queryable: Queryable,
  sourceDocumentId: string,
): Promise<void> {
  const { rows } = await queryable.query(
    `SELECT 1
     FROM "programme_assignment" assignment
     JOIN "programme_content_versions" version
       ON version."programmeVersionId" = assignment."programmeVersionId"
     WHERE version."sourceDocumentId" = $1
       AND assignment."active" = true
     LIMIT 1`,
    [sourceDocumentId],
  );

  if (rows.length > 0) {
    throw new Error(
      "This programme has an assigned journey and cannot be archived or deleted.",
    );
  }
}

async function persistLifecycleChange(
  sourceDocumentId: string,
  change: LifecycleChange,
): Promise<void> {
  await withTransaction(
    PROGRAMME_MATCHING_PUBLICATION_LOCK,
    async (client) => {
      if (change.leavingEligible) {
        await assertProgrammeNotTargetedByActiveMatching(
          client,
          sourceDocumentId,
        );
      }
      if (change.enteringArchived) {
        await assertProgrammeHasNoAssignments(client, sourceDocumentId);
      }
      await updateProgrammeEligibility(
        client,
        sourceDocumentId,
        change.requested,
        change.publicationStatus,
      );
    },
  );
}

async function lifecycleChangeForOperation(
  payload: Payload,
  operation: ProgrammeOperationContext,
  originalDoc: ProgrammeState | undefined,
  data: ProgrammeState,
): Promise<{ change: LifecycleChange; previous: ProgrammeState } | null> {
  if (operation.savingDraft) {
    assertLifecycleTransition(
      originalDoc?.lifecycleStatus,
      data.lifecycleStatus ?? originalDoc?.lifecycleStatus,
    );
    return null;
  }

  const currentPublished = originalDoc?.id
    ? await publishedProgramme(payload, originalDoc.id)
    : null;
  const previous = currentPublished ?? originalDoc ?? {};
  const change = programmeAvailabilityChange(
    previous,
    data,
    operation.unpublishing,
  );

  return change ? { change, previous } : null;
}

function rememberEligibilityRollback(
  context: Record<string, unknown>,
  sourceDocumentId: string,
  previous: ProgrammeState,
): void {
  const previousLifecycle = lifecycle(previous.lifecycleStatus);

  if (previousLifecycle) {
    context[ROLLBACK_CONTEXT_KEY] = {
      sourceDocumentId,
      lifecycleStatus: previousLifecycle,
      publicationStatus: publicationStatus(previous._status),
    } satisfies EligibilityRollback;
  }
}

export const preventAssignedProgrammeArchive: CollectionBeforeChangeHook = async ({
  context,
  data,
  originalDoc,
  req,
}) => {
  const prepared = await lifecycleChangeForOperation(
    req?.payload,
    programmeOperation(context),
    originalDoc,
    data,
  );

  if (prepared && originalDoc?.id !== undefined) {
    const sourceDocumentId = String(originalDoc.id);
    await persistLifecycleChange(sourceDocumentId, prepared.change);
    rememberEligibilityRollback(context, sourceDocumentId, prepared.previous);
  }

  return data;
};

export const synchroniseProgrammeEligibility: CollectionAfterChangeHook = async ({
  context,
  doc,
}) => {
  if (programmeOperation(context).savingDraft) {
    return doc;
  }

  const status = lifecycle(doc.lifecycleStatus);

  if (doc.id !== undefined && status) {
    if (!context[ROLLBACK_CONTEXT_KEY]) {
      context[ROLLBACK_CONTEXT_KEY] = {
        remove: true,
        sourceDocumentId: String(doc.id),
      } satisfies EligibilityRollback;
    }
    await withTransaction(
      PROGRAMME_MATCHING_PUBLICATION_LOCK,
      async (client) =>
        updateProgrammeEligibility(
          client,
          String(doc.id),
          status,
          publicationStatus(doc._status),
        ),
    );
  }

  return doc;
};

export const preventAssignedProgrammeDelete: CollectionBeforeDeleteHook = async ({
  context,
  id,
  req,
}) => {
  const sourceDocumentId = String(id);
  const previous =
    (await publishedProgramme(req.payload, id)) ??
    (await req.payload.findByID({
      collection: "programmes",
      id,
      depth: 0,
      draft: true,
      overrideAccess: true,
      req,
    }));
  const previousLifecycle = lifecycle(previous.lifecycleStatus) ?? "draft";
  context[ROLLBACK_CONTEXT_KEY] = {
    sourceDocumentId,
    lifecycleStatus: previousLifecycle,
    publicationStatus: publicationStatus(previous._status),
  } satisfies EligibilityRollback;
  await withTransaction(
    PROGRAMME_MATCHING_PUBLICATION_LOCK,
    async (client) => {
      await assertProgrammeNotTargetedByActiveMatching(client, sourceDocumentId);
      await assertProgrammeHasNoAssignments(client, sourceDocumentId);
      await updateProgrammeEligibility(
        client,
        sourceDocumentId,
        "deleted",
        "draft",
      );
    },
  );
};

export const restoreProgrammeEligibilityAfterError: CollectionAfterErrorHook =
  async ({ context }) => {
    const rollback = context[ROLLBACK_CONTEXT_KEY] as
      | EligibilityRollback
      | undefined;

    if (!rollback) {
      return;
    }

    await withTransaction(PROGRAMME_MATCHING_PUBLICATION_LOCK, async (client) => {
      if (rollback.remove) {
        await updateProgrammeEligibility(
          client,
          rollback.sourceDocumentId,
          "deleted",
          "draft",
        );
        return;
      }

      if (rollback.lifecycleStatus && rollback.publicationStatus) {
        await updateProgrammeEligibility(
          client,
          rollback.sourceDocumentId,
          rollback.lifecycleStatus,
          rollback.publicationStatus,
        );
      }
    });
    delete context[ROLLBACK_CONTEXT_KEY];
  };
