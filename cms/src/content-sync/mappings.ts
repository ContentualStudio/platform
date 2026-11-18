import {
  validateRuleForPublish,
  type AuthoredEngineRule,
} from "../content-engine/rule-authoring";

export const syncedCollections = [
  "lessons",
  "programmes",
  "modules",
  "tasks",
  "engine-rules",
  "engine-badges",
  "engine-call-types",
] as const;

export type SyncedCollection = (typeof syncedCollections)[number];

// How a projected value is bound into the mirror INSERT. The kind drives both
// the SQL cast and the encoding of the JavaScript value into a pg parameter.
export type MirrorColumnKind =
  "boolean" | "integer" | "jsonb" | "text" | "text[]";

export interface SourceDocument {
  id: number | string;
  updatedAt: string;
  _status?: "draft" | "published";
  [key: string]: unknown;
}

export interface MirrorProjection {
  collection: SyncedCollection;
  columns: Record<string, MirrorColumnKind>;
  publishedAt: string;
  sourceDocumentId: string;
  sourceUpdatedAt: string;
  table: string;
  values: Record<string, unknown>;
}

interface SyncMapping {
  columns: Record<string, MirrorColumnKind>;
  project: (document: SourceDocument) => Record<string, unknown>;
  table: string;
}

function relationId(value: unknown): string | null {
  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }

  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    (typeof value.id === "number" || typeof value.id === "string")
  ) {
    return String(value.id);
  }

  return null;
}

function relationIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(relationId).filter((id): id is string => id !== null)
    : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// The "integer" sibling of text() and boolean(): a non-number mirrors as null
// rather than coercing, so a blank authored field stays blank in the mirror.
function integer(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function mediaUrl(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("url" in value)) return null;
  const raw = text(value.url);
  if (!raw) return null;
  try {
    const url = new URL(raw, process.env.PAYLOAD_PUBLIC_SERVER_URL);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

// Payload omits an unchecked checkbox entirely on some update paths, so anything
// that is not explicitly true mirrors as false rather than null.
function boolean(value: unknown): boolean {
  return value === true;
}

// Both engine catalogues are the same shape; the only difference is the table
// they land in.
function catalogueMapping(table: string): SyncMapping {
  return {
    table,
    columns: {
      key: "text",
      name: "text",
      description: "text",
      active: "boolean",
    },
    project: (document) => ({
      key: text(document.key),
      name: text(document.name),
      description: text(document.description),
      active: boolean(document.active),
    }),
  };
}

// Each mapping owns only its document-to-row projection and the column types
// that projection produces. The hook, queue, retry, audit, and backfill
// machinery is deliberately collection-agnostic: adding a synced collection
// means adding an entry here plus its mirror table, nothing else.
const mappings: Record<SyncedCollection, SyncMapping> = {
  lessons: {
    table: "studio_lessons",
    columns: {
      slug: "text",
      title: "text",
      summary: "text",
      body: "jsonb",
      attachmentsIds: "text[]",
      minimumTier: "text",
      lessonType: "text",
      skillLevel: "text",
      contentType: "text",
      platforms: "text[]",
      programmeRelevance: "text[]",
      programmeDayStart: "integer",
      programmeDayEnd: "integer",
      vimeoVideoId: "text",
      templateMediaId: "text",
      templateUrl: "text",
    },
    project: (document) => ({
      slug: text(document.slug),
      title: text(document.title),
      summary: text(document.summary),
      body: document.body ?? null,
      attachmentsIds: relationIds(document.attachments),
      minimumTier: text(document.minimumTier) ?? "free",
      lessonType: text(document.lessonType),
      skillLevel: text(document.skillLevel),
      contentType: text(document.contentType),
      platforms: Array.isArray(document.platforms) ? document.platforms : [],
      programmeRelevance: relationIds(document.programmeRelevance),
      programmeDayStart: integer(document.programmeDayStart),
      programmeDayEnd: integer(document.programmeDayEnd),
      vimeoVideoId: text(document.vimeoVideoId),
      // Lesson sync populates media once at publish/backfill time.
      templateMediaId: relationId(document.templateFile),
      templateUrl: mediaUrl(document.templateFile),
    }),
  },
  programmes: {
    table: "programme",
    columns: {
      slug: "text",
      title: "text",
      description: "text",
      access: "text",
      durationDays: "integer",
      experienceLevel: "text",
      difficulty: "text",
      track: "text",
      minimumTier: "text",
      founderVideoUrl: "text",
      expectations: "jsonb",
      ctaText: "text",
      milestones: "jsonb",
      insightMoments: "jsonb",
      lessonIds: "text[]",
    },
    project: (document) => ({
      slug: text(document.slug),
      title: text(document.title),
      description: text(document.description),
      access: text(document.access),
      durationDays: integer(document.durationDays),
      experienceLevel: text(document.experienceLevel),
      difficulty: text(document.difficulty),
      track: text(document.track),
      // A programme published before the gate existed carries no value and
      // must stay open, so the projection fills "free" rather than null.
      minimumTier: text(document.minimumTier) ?? "free",
      founderVideoUrl: text(document.founderVideoUrl),
      expectations: document.expectations ?? null,
      ctaText: text(document.ctaText),
      milestones: Array.isArray(document.milestones) ? document.milestones : [],
      insightMoments: Array.isArray(document.insightMoments)
        ? document.insightMoments
        : [],
      lessonIds: relationIds(document.lessons),
    }),
  },
  modules: {
    table: "programme_modules",
    columns: {
      slug: "text",
      title: "text",
      moduleOrder: "integer",
      programmeId: "text",
      lessonIds: "text[]",
    },
    project: (document) => ({
      slug: text(document.slug),
      title: text(document.title),
      moduleOrder: integer(document.order),
      programmeId: relationId(document.programme),
      lessonIds: relationIds(document.lessons),
    }),
  },
  tasks: {
    table: "programme_tasks",
    columns: {
      slug: "text",
      title: "text",
      instructions: "jsonb",
      contentType: "text",
      lessonId: "text",
      programmeId: "text",
      moduleId: "text",
      dayNumber: "integer",
      orderWithinDay: "integer",
      dayType: "text",
      timeEstimateMinutes: "integer",
      publishSlot: "boolean",
      postNumber: "integer",
      platform: "text",
      cameraRequired: "boolean",
      objective: "text",
      openingLine: "text",
      whyItMatters: "jsonb",
      pausePrompt: "jsonb",
      outputDescription: "jsonb",
    },
    project: (document) => ({
      slug: text(document.slug),
      title: text(document.title),
      instructions: document.instructions ?? null,
      contentType: text(document.contentType),
      lessonId: relationId(document.lesson),
      programmeId: relationId(document.programme),
      moduleId: relationId(document.module),
      dayNumber: integer(document.dayNumber),
      orderWithinDay: integer(document.orderWithinDay),
      dayType: text(document.dayType),
      timeEstimateMinutes: integer(document.timeEstimateMinutes),
      publishSlot: boolean(document.publishSlot),
      postNumber: integer(document.postNumber),
      platform: text(document.platform),
      cameraRequired: boolean(document.cameraRequired),
      objective: text(document.objective),
      openingLine: text(document.openingLine),
      whyItMatters: document.whyItMatters ?? null,
      pausePrompt: document.pausePrompt ?? null,
      outputDescription: document.outputDescription ?? null,
    }),
  },
  "engine-rules": {
    table: "engine_rules",
    columns: {
      key: "text",
      name: "text",
      description: "text",
      triggerEvent: "text",
      conditions: "jsonb",
      effectType: "text",
      effectParams: "jsonb",
      dedupeScope: "text",
      priority: "integer",
      active: "boolean",
    },
    // The projection runs the same validator that gates publication, so the
    // mirror and the CMS can never disagree about what a rule means. Only a
    // published document reaches here, so a failure is drift — it is raised
    // rather than mirrored, and the sync event records it for an operator.
    project: (document) => {
      const result = validateRuleForPublish(
        document as unknown as AuthoredEngineRule,
      );

      if (!result.valid) {
        throw new Error(
          `Cannot mirror engine rule ${String(document.key ?? document.id)}: ${result.errors
            .map((error) => error.message)
            .join("; ")}`,
        );
      }

      return {
        key: text(document.key),
        name: text(document.name),
        description: text(document.description),
        triggerEvent: result.rule.triggerEvent,
        conditions: result.rule.conditions,
        effectType: result.rule.effectType,
        effectParams: result.rule.effectParams,
        dedupeScope: result.rule.dedupeScope,
        priority: Number.isInteger(document.priority) ? document.priority : 100,
        active: result.rule.active,
      };
    },
  },
  "engine-badges": catalogueMapping("engine_badges"),
  "engine-call-types": catalogueMapping("engine_call_types"),
};

export function isSyncedCollection(value: string): value is SyncedCollection {
  return syncedCollections.includes(value as SyncedCollection);
}

export function projectDocument(
  collection: SyncedCollection,
  document: SourceDocument,
): MirrorProjection {
  const mapping = mappings[collection];

  return {
    collection,
    columns: mapping.columns,
    // Payload's core draft model has no immutable published-at field. Until a
    // content collection adds one, the successful published revision time is
    // the only correct timestamp available to the mirror.
    publishedAt: document.updatedAt,
    sourceDocumentId: String(document.id),
    sourceUpdatedAt: document.updatedAt,
    table: mapping.table,
    values: mapping.project(document),
  };
}

export function mirrorTableFor(collection: SyncedCollection): string {
  return mappings[collection].table;
}
