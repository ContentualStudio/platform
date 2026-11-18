import type { Payload, Where } from "payload";
import { randomUUID } from "node:crypto";
import { relationshipSourceId } from "../payload-values";
import type {
  ProgrammeTarget,
  ProgrammeTargetLookup,
} from "./matching-authoring";
import type { ProgrammeContentSnapshot } from "./programme-content-snapshot";

const PROGRAMMES = "programmes";
const PUBLISHED = "published";

/**
 * Resolves a rule's programme relationship to the exact published content it
 * targets.
 *
 * `programmeKey` is the stable routing key. `programmeVersionId` is a newly
 * generated publication identity and the target carries the complete graph that
 * will be materialised under it in the app database. The Payload document and
 * its asynchronous mirror are never the runtime source for this assignment.
 *
 * Returning `null` covers every unusable case the specification lists —
 * missing, draft, retired, archived, or never published — because from a rule's
 * point of view they are one condition: this target cannot receive new
 * assignments. The caller turns that into a message naming the rule.
 */
export function payloadProgrammeTargets(
  payload: Payload,
): ProgrammeTargetLookup {
  // Several rules commonly route into the same programme, and the validator
  // resolves one rule at a time. The cache is built per lookup — the endpoint
  // constructs one per publish — so its lifetime is a single publication and it
  // cannot serve a stale programme to a later one.
  // Cache keys are namespaced because a document id and a slug are different
  // questions that can collide as bare strings.
  const resolved = new Map<string, ProgrammeTarget | null>();

  const memoized = async (
    cacheKey: string,
    lookUp: () => Promise<ProgrammeTarget | null>,
  ): Promise<ProgrammeTarget | null> => {
    const cached = resolved.get(cacheKey);

    if (cached !== undefined) {
      return cached;
    }

    const target = await lookUp();
    resolved.set(cacheKey, target);
    return target;
  };

  return {
    async resolve(reference: unknown): Promise<ProgrammeTarget | null> {
      const id = relationshipSourceId(reference);

      return id
        ? memoized(`id:${id}`, () => lookUp(payload, { id: { equals: id } }))
        : null;
    },

    async resolveKey(programmeKey: string): Promise<ProgrammeTarget | null> {
      return memoized(`key:${programmeKey}`, () =>
        lookUp(payload, { key: { equals: programmeKey } }),
      );
    },
  };
}

async function lookUp(
  payload: Payload,
  where: Where,
): Promise<ProgrammeTarget | null> {
  const result = await payload.find({
    collection: PROGRAMMES,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: publishedWhere(where),
  });
  const metadata = programmeMetadata(result.docs[0]);

  if (!metadata) {
    return null;
  }

  const snapshot = await loadProgrammeSnapshot(
    payload,
    metadata.document,
    metadata.sourceDocumentId,
  );

  if (!snapshot) {
    return null;
  }

  return {
    programmeKey: metadata.key,
    programmeVersionId: `pv_${randomUUID()}`,
    sourceDocumentId: metadata.sourceDocumentId,
    sourceUpdatedAt: metadata.updatedAt,
    snapshot,
  };
}

interface ProgrammeMetadata {
  document: Record<string, unknown>;
  key: string;
  updatedAt: string;
  sourceDocumentId: string;
}

function programmeMetadata(value: unknown): ProgrammeMetadata | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const document = value as Record<string, unknown>;
  const isRetired =
    document.lifecycleStatus !== undefined &&
    document.lifecycleStatus !== "live";
  const key = stringValue(document.key);
  const updatedAt =
    typeof document.updatedAt === "string" ? document.updatedAt : "";
  const sourceDocumentId = relationshipSourceId(document.id);

  if (
    document._status !== PUBLISHED ||
    isRetired ||
    !key ||
    !updatedAt ||
    !sourceDocumentId
  ) {
    return null;
  }

  return { document, key, updatedAt, sourceDocumentId };
}

async function loadProgrammeSnapshot(
  payload: Payload,
  document: Record<string, unknown>,
  sourceDocumentId: string,
): Promise<ProgrammeContentSnapshot | null> {
  const [modulesResult, tasksResult] = await Promise.all([
    payload.find({
      collection: "modules",
      depth: 0,
      limit: 1000,
      overrideAccess: true,
      pagination: false,
      where: publishedWhere({
        programme: { equals: document.id },
      }),
    }),
    payload.find({
      collection: "tasks",
      depth: 0,
      limit: 5000,
      overrideAccess: true,
      pagination: false,
      where: publishedWhere({
        programme: { equals: document.id },
      }),
    }),
  ]);

  // Payload pagination is a correctness boundary here, not a presentation
  // detail. A capped query would otherwise look like a complete graph and
  // publish a snapshot that silently omits the tail of a programme.
  if (modulesResult.hasNextPage || tasksResult.hasNextPage) {
    return null;
  }

  const modules = modulesResult.docs as unknown as Record<string, unknown>[];
  const tasks = tasksResult.docs as unknown as Record<string, unknown>[];
  const lessonIds = lessonIdsFor(document, modules, tasks);
  const lessons = await loadLessons(payload, lessonIds);
  if (lessons === null) {
    return null;
  }
  const normalizedModules = modules
    .map((moduleDocument) => normalizeModule(moduleDocument, sourceDocumentId))
    .filter((module): module is NonNullable<typeof module> => module !== null);
  const normalizedLessons = lessons
    .map(normalizeLesson)
    .filter((lesson): lesson is NonNullable<typeof lesson> => lesson !== null);
  const normalizedTasks = tasks
    .map((task) => normalizeTask(task, sourceDocumentId))
    .filter((task): task is NonNullable<typeof task> => task !== null);
  const lessonIdentifiers = new Set(
    normalizedLessons.flatMap((lesson) => [lesson.id, lesson.key]),
  );

  // A publication must carry the whole graph it claims to target. Dropping an
  // invalid child here would create a version that exists in the app database
  // but serves a partial programme; reject the target instead and leave the
  // currently active matching setup untouched.
  if (
    normalizedModules.length !== modules.length ||
    normalizedLessons.length !== lessons.length ||
    normalizedTasks.length !== tasks.length ||
    normalizedLessons.length !== lessonIds.length ||
    lessonIds.some((lessonId) => !lessonIdentifiers.has(lessonId))
  ) {
    return null;
  }

  return {
    programme: programmeSnapshot(document, sourceDocumentId),
    modules: normalizedModules,
    lessons: normalizedLessons,
    tasks: normalizedTasks,
  };
}

function publishedWhere(where: Where): Where {
  return {
    and: [where, { _status: { equals: PUBLISHED } }],
  };
}

function programmeSnapshot(
  document: Record<string, unknown>,
  sourceDocumentId: string,
): ProgrammeContentSnapshot["programme"] {
  return {
    id: sourceDocumentId,
    key: stringValue(document.key),
    title: stringValue(document.title),
    description: nullableString(document.description),
    access: nullableString(document.access),
    durationDays: nullableNumber(document.durationDays),
    experienceLevel: nullableString(document.experienceLevel),
    difficulty: nullableStringOrNumber(document.difficulty),
    track: nullableString(document.track),
    minimumTier: nullableString(document.minimumTier) ?? "free",
    founderVideoUrl: nullableString(document.founderVideoUrl),
    expectations: document.expectations ?? null,
    ctaText: nullableString(document.ctaText),
    milestones: arrayValue(document.milestones),
    insightMoments: arrayValue(document.insightMoments),
  };
}

function lessonIdsFor(
  document: Record<string, unknown>,
  modules: Record<string, unknown>[],
  tasks: Record<string, unknown>[],
): string[] {
  const lessonIds = new Set<string>(relationIds(document.lessons));

  for (const moduleDocument of modules) {
    for (const lessonId of relationIds(moduleDocument.lessons)) {
      lessonIds.add(lessonId);
    }
  }

  for (const task of tasks) {
    const lessonId = relationshipSourceId(task.lesson);
    if (lessonId) {
      lessonIds.add(lessonId);
    }
  }

  return [...lessonIds];
}

async function loadLessons(
  payload: Payload,
  lessonIds: string[],
): Promise<Record<string, unknown>[] | null> {
  if (lessonIds.length === 0) {
    return [];
  }

  const result = await payload.find({
    collection: "lessons",
    depth: 0,
    limit: lessonIds.length,
    overrideAccess: true,
    pagination: false,
    where: publishedWhere({ id: { in: lessonIds } }),
  });

  if (result.hasNextPage) {
    return null;
  }

  return result.docs as unknown as Record<string, unknown>[];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown): string | null {
  const result = stringValue(value);
  return result || null;
}

function nullableStringOrNumber(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function relationIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(relationshipSourceId)
    .filter((id): id is string => id !== null);
}

function normalizeModule(
  document: Record<string, unknown>,
  programmeId: string,
): ProgrammeContentSnapshot["modules"][number] | null {
  const id = relationshipSourceId(document.id);
  const key = stringValue(document.slug);
  const title = stringValue(document.title);
  const order = nullableNumber(document.order);

  if (!id || !key || !title || order === null) {
    return null;
  }

  return {
    id,
    key,
    title,
    order,
    programmeId,
    lessonIds: relationIds(document.lessons),
  };
}

function normalizeLesson(
  document: Record<string, unknown>,
): ProgrammeContentSnapshot["lessons"][number] | null {
  const id = relationshipSourceId(document.id);
  const key = stringValue(document.slug);
  const title = stringValue(document.title);

  if (!id || !key || !title) {
    return null;
  }

  return {
    id,
    key,
    title,
    summary: nullableString(document.summary),
    body: document.body ?? null,
    attachmentsIds: relationIds(document.attachments),
    minimumTier: nullableString(document.minimumTier) ?? "free",
  };
}

function normalizeTask(
  document: Record<string, unknown>,
  programmeId: string,
): ProgrammeContentSnapshot["tasks"][number] | null {
  const id = relationshipSourceId(document.id);
  const key = stringValue(document.slug);
  const title = stringValue(document.title);
  const contentType = nullableString(document.contentType);
  const dayNumber = nullableNumber(document.dayNumber);
  const orderWithinDay = nullableNumber(document.orderWithinDay);

  if (
    !id ||
    !key ||
    !title ||
    !contentType ||
    dayNumber === null ||
    orderWithinDay === null
  ) {
    return null;
  }

  return {
    id,
    key,
    title,
    contentType,
    programmeId,
    dayNumber,
    orderWithinDay,
    ...taskPresentation(document),
  };
}

/**
 * The authored fields the daily task card renders. Split out from
 * `normalizeTask` so the identity-and-schedule guard above stays readable as
 * the card grows fields; every one of these is optional in the CMS and
 * projects to null when the content team left it blank.
 */
function taskPresentation(document: Record<string, unknown>) {
  return {
    instructions: document.instructions ?? null,
    moduleId: relationshipSourceId(document.module),
    lessonId: relationshipSourceId(document.lesson),
    dayType: nullableString(document.dayType),
    timeEstimateMinutes: nullableNumber(document.timeEstimateMinutes),
    publishSlot: document.publishSlot === true,
    postNumber: nullableNumber(document.postNumber),
    platform: nullableString(document.platform),
    cameraRequired: document.cameraRequired === true,
    objective: nullableString(document.objective),
    openingLine: nullableString(document.openingLine),
    whyItMatters: document.whyItMatters ?? null,
    pausePrompt: document.pausePrompt ?? null,
    outputDescription: document.outputDescription ?? null,
  };
}
