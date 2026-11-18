import type { CollectionBeforeValidateHook } from "payload";
import { ValidationError } from "payload";

export const programmeTrackOptions = [
  "starter",
  "grinder",
  "pro",
  "recovery",
  "smb",
  "keep_creating",
] as const;

export const experienceLevelOptions = [
  "beginner",
  "intermediate",
  "advanced",
] as const;

export const difficultyOptions = ["easy", "medium", "hard"] as const;

// Whether a programme can be started by anyone, or only by a user the engine
// has recorded an unlock for. Nothing in Phase 1 is locked; the vocabulary
// exists so gating a programme is a content edit rather than a build.
export const programmeAccessOptions = ["open", "locked"] as const;

// The lowest billing tier that may start a programme. Mirrors the tier keys
// in the api's billing vocabulary (`billing-tiers.ts`); "free" opens the
// programme to everyone, and anything unrecognised is read as "free" on the
// app side so content drift can only ever open a programme, never lock it.
export const programmeTierOptions = ["free", "creator", "pro"] as const;

export const taskDayTypeOptions = ["push", "protect", "recharge"] as const;

// These values are the machine-readable vocabulary used by the First Take
// task schedule and Content Engine conditions. Labels in Payload can change
// without changing the event contract.
export const taskContentTypeOptions = [
  "video",
  "photo",
  "caption",
  "story",
] as const;

// The platform a task's output is published to. Machine-readable for the same
// reason as taskContentTypeOptions: the admin label can change, the value the
// card and the engine read cannot.
export const taskPlatformOptions = [
  "instagram",
  "tiktok",
  "youtube",
  "linkedin",
  "facebook",
  "x",
  "pinterest",
] as const;

export const lessonTypeOptions = [
  "article",
  "video",
  "masterclass",
  "template",
] as const;

// The platforms a lesson can be tagged for. Instagram is the only platform the
// app surfaces as an active filter today; the rest can be tagged now so the
// library is ready when the integration lands, but they must not appear as
// filters until their status flips to "active".
export const lessonPlatformOptions = [
  { value: "instagram", label: "Instagram", status: "active" },
  { value: "youtube", label: "YouTube (coming soon)", status: "coming_soon" },
  { value: "tiktok", label: "TikTok (coming soon)", status: "coming_soon" },
  { value: "linkedin", label: "LinkedIn (coming soon)", status: "coming_soon" },
] as const;

export const lessonPlatformValues = lessonPlatformOptions.map((p) => p.value);
export const activeLessonPlatforms = lessonPlatformOptions
  .filter((p) => p.status === "active")
  .map((p) => p.value);

export const insightMomentTriggerOptions = [
  "day",
  "task_completed",
  "week_completed",
  "three_consecutive_skipped_days",
] as const;

type ContentRecord = Record<string, unknown>;

export function relationshipId(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    (typeof value.id === "string" || typeof value.id === "number")
  ) {
    return String(value.id);
  }

  return null;
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

/**
 * Payload select options from a code-defined vocabulary. Lives here because
 * every collection already imports its vocabularies from this module, and the
 * label rule (capitalise the machine value) must not drift between them.
 */
export const optionsFrom = (values: readonly string[]) =>
  values.map((value) => ({
    label: value[0].toUpperCase() + value.slice(1),
    value,
  }));

export function positiveIntegerValidator(
  fieldName: string,
): (value: unknown) => true | string {
  return (value) =>
    !isPresent(value) || isPositiveInteger(value)
      ? true
      : `${fieldName} must be a positive integer`;
}

/**
 * "This field, when set, must be one of these values."
 *
 * The shape every authored vocabulary check in this file was writing out by
 * hand. Generalised alongside `positiveIntegerValidator`, which already does
 * the same job for the numeric case.
 */
export function oneOf(
  field: string,
  options: readonly string[],
): (input: ContentRecord) => string[] {
  return (input) =>
    isPresent(input[field]) && !options.includes(input[field] as string)
      ? [`${field} must be one of ${options.join(", ")}`]
      : [];
}

export const validateProgrammeAccess = oneOf("access", programmeAccessOptions);
export const validateProgrammeMinimumTier = oneOf(
  "minimumTier",
  programmeTierOptions,
);

export function validateTaskFields(
  input: ContentRecord,
  programmeDurationDays?: unknown,
  published = false,
): string[] {
  const errors: string[] = [];

  if (published && !isPresent(input.contentType)) {
    errors.push("contentType is required when publishing a task");
  } else if (
    isPresent(input.contentType) &&
    !taskContentTypeOptions.includes(
      input.contentType as (typeof taskContentTypeOptions)[number],
    )
  ) {
    errors.push("contentType must be one of video, photo, caption, or story");
  }

  if (isPresent(input.dayNumber) && !isPositiveInteger(input.dayNumber)) {
    errors.push("dayNumber must be a positive integer");
  } else if (
    isPositiveInteger(input.dayNumber) &&
    isPositiveInteger(programmeDurationDays) &&
    (input.dayNumber as number) > (programmeDurationDays as number)
  ) {
    errors.push("dayNumber must not exceed the programme duration");
  }

  if (
    isPresent(input.orderWithinDay) &&
    !isPositiveInteger(input.orderWithinDay)
  ) {
    errors.push("orderWithinDay must be a positive integer");
  }

  if (
    isPresent(input.dayType) &&
    !taskDayTypeOptions.includes(
      input.dayType as (typeof taskDayTypeOptions)[number],
    )
  ) {
    errors.push("dayType must be one of push, protect, or recharge");
  }

  if (
    isPresent(input.timeEstimateMinutes) &&
    !isPositiveInteger(input.timeEstimateMinutes)
  ) {
    errors.push("timeEstimateMinutes must be a positive integer");
  }

  if (
    isPresent(input.platform) &&
    !taskPlatformOptions.includes(
      input.platform as (typeof taskPlatformOptions)[number],
    )
  ) {
    errors.push(
      `platform must be one of ${taskPlatformOptions.join(", ")}`,
    );
  }

  if (input.publishSlot === true && !isPresent(input.postNumber)) {
    errors.push("postNumber is required when publishSlot is enabled");
  }

  if (input.publishSlot === false && isPresent(input.postNumber)) {
    errors.push("postNumber must be empty when publishSlot is disabled");
  }

  if (isPresent(input.postNumber) && !isPositiveInteger(input.postNumber)) {
    errors.push("postNumber must be a positive integer");
  }

  return errors;
}

export function validateModuleFields(input: ContentRecord): string[] {
  const errors: string[] = [];

  if (isPresent(input.order) && !isPositiveInteger(input.order)) {
    errors.push("order must be a positive integer");
  }

  if (!relationshipId(input.programme)) {
    errors.push("programme is required");
  }

  if (!Array.isArray(input.lessons) || input.lessons.length === 0) {
    errors.push("lessons must contain at least one lesson");
  }

  return errors;
}

export function validateProgrammeFields(input: ContentRecord): string[] {
  const errors: string[] = [
    ...validateProgrammeAccess(input),
    ...validateProgrammeMinimumTier(input),
  ];
  const durationDays = input.durationDays;

  if (isPresent(durationDays) && !isPositiveInteger(durationDays)) {
    errors.push("durationDays must be a positive integer");
  }

  if (Array.isArray(input.milestones)) {
    input.milestones.forEach((milestone, index) => {
      if (!milestone || typeof milestone !== "object") {
        errors.push(`milestones.${index} must be an object`);
        return;
      }

      const triggerDay = (milestone as ContentRecord).triggerDay;
      if (isPresent(triggerDay) && !isPositiveInteger(triggerDay)) {
        errors.push(`milestones.${index}.triggerDay must be a positive integer`);
      } else if (
        isPositiveInteger(triggerDay) &&
        isPositiveInteger(durationDays) &&
        (triggerDay as number) > (durationDays as number)
      ) {
        errors.push(
          `milestones.${index}.triggerDay must not exceed the programme duration`,
        );
      }
    });
  }

  if (Array.isArray(input.insightMoments)) {
    input.insightMoments.forEach((moment, index) => {
      if (!moment || typeof moment !== "object") {
        errors.push(`insightMoments.${index} must be an object`);
        return;
      }

      const triggerType = (moment as ContentRecord).triggerType;
      if (
        isPresent(triggerType) &&
        !insightMomentTriggerOptions.includes(
          triggerType as (typeof insightMomentTriggerOptions)[number],
        )
      ) {
        errors.push(
          `insightMoments.${index}.triggerType must be one of ${insightMomentTriggerOptions.join(", ")}`,
        );
      }
    });
  }

  return errors;
}

export function validateLessonFields(
  input: ContentRecord,
  published = false,
  templateMimeType?: unknown,
): string[] {
  const errors: string[] = [
    ...oneOf("lessonType", lessonTypeOptions)(input),
    ...oneOf("skillLevel", experienceLevelOptions)(input),
    ...oneOf("contentType", taskContentTypeOptions)(input),
  ];

  if (isPresent(input.platforms)) {
    const platforms = Array.isArray(input.platforms)
      ? input.platforms
      : [input.platforms];
    const invalid = platforms.filter(
      (platform) =>
        typeof platform !== "string" ||
        !(
          lessonPlatformValues as readonly string[]
        ).includes(platform),
    );
    if (invalid.length > 0) {
      errors.push(`platforms must be one of ${lessonPlatformValues.join(", ")}`);
    }
  }

  if (!published) {
    return errors;
  }

  if (!isPresent(input.lessonType)) {
    errors.push("lessonType is required when publishing a lesson");
  }

  if (!isPresent(input.skillLevel)) {
    errors.push("skillLevel is required when publishing a lesson");
  }

  if (!isPresent(input.contentType)) {
    errors.push("contentType is required when publishing a lesson");
  }

  if (!Array.isArray(input.platforms) || input.platforms.length === 0) {
    errors.push("platforms is required when publishing a lesson");
  }

  const programmeRelevance = input.programmeRelevance;
  if (!Array.isArray(programmeRelevance) || programmeRelevance.length === 0) {
    errors.push("programmeRelevance is required when publishing a lesson");
  }

  if (!isPresent(input.programmeDayStart)) {
    errors.push("programmeDayStart is required when publishing a lesson");
  } else if (!isPositiveInteger(input.programmeDayStart)) {
    errors.push("programmeDayStart must be a positive integer");
  }

  if (!isPresent(input.programmeDayEnd)) {
    errors.push("programmeDayEnd is required when publishing a lesson");
  } else if (!isPositiveInteger(input.programmeDayEnd)) {
    errors.push("programmeDayEnd must be a positive integer");
  }

  if (
    isPositiveInteger(input.programmeDayStart) &&
    isPositiveInteger(input.programmeDayEnd) &&
    (input.programmeDayStart as number) > (input.programmeDayEnd as number)
  ) {
    errors.push("programmeDayStart must not exceed programmeDayEnd");
  }

  // One rule per lesson type: the body field that type must carry, and the
  // other types' fields that must be empty. admin.condition hides the other
  // fields when an author switches type, but hidden data persists — rejecting
  // it stops a republished lesson mirroring stale fields from its old type.
  const present: Record<string, boolean> = {
    body: isPresent(input.body),
    vimeoVideoId: isPresent(input.vimeoVideoId),
    templateFile: Boolean(relationshipId(input.templateFile)),
  };
  const lessonType = input.lessonType as string;
  const bodyRule = lessonBodyRules[lessonType];

  if (bodyRule) {
    if (!present[bodyRule.requires]) {
      errors.push(`${bodyRule.requires} is required when lessonType is ${lessonType}`);
    } else if (lessonType === "template" && templateMimeType !== "application/pdf") {
      // Fail closed: an unresolvable mime type rejects exactly like a
      // non-PDF, so a missing media row can never publish a non-PDF.
      errors.push("templateFile must be a PDF");
    }

    for (const field of bodyRule.forbids) {
      if (present[field]) {
        errors.push(`${field} must be empty when lessonType is ${lessonType}`);
      }
    }
  }

  return errors;
}

const lessonBodyRules: Record<
  string,
  { requires: string; forbids: readonly string[] }
> = {
  article: { requires: "body", forbids: ["vimeoVideoId", "templateFile"] },
  video: { requires: "vimeoVideoId", forbids: ["body", "templateFile"] },
  masterclass: { requires: "vimeoVideoId", forbids: ["body", "templateFile"] },
  template: { requires: "templateFile", forbids: ["body", "vimeoVideoId"] },
};

function validationPath(collection: string, message: string): string {
  const nestedField = message.match(
    /^(milestones|insightMoments)\.\d+(?:\.[A-Za-z]+)?/,
  )?.[0];

  if (nestedField) {
    return nestedField;
  }

  return (
    message.match(
      /^(durationDays|minimumTier|contentType|dayNumber|orderWithinDay|dayType|timeEstimateMinutes|postNumber|programme|module|order|lessons|lessonType|skillLevel|platforms|programmeRelevance|programmeDayStart|programmeDayEnd|body|vimeoVideoId|templateFile)/,
    )?.[1] ?? collection
  );
}

function validationError(collection: string, errors: string[]): ValidationError {
  return new ValidationError({
    collection,
    errors: errors.map((message) => ({
      message,
      path: validationPath(collection, message),
    })),
  });
}

function mergedDocument(
  data: unknown,
  originalDoc: unknown,
): ContentRecord {
  return {
    ...((originalDoc ?? {}) as ContentRecord),
    ...((data ?? {}) as ContentRecord),
  };
}

function isPublished(document: ContentRecord): boolean {
  return document._status === "published";
}

type PayloadLike = {
  findByID: (args: Record<string, unknown>) => Promise<ContentRecord | undefined>;
  find: (args: Record<string, unknown>) => Promise<{
    docs?: ContentRecord[];
    totalDocs?: number;
  }>;
};

function payloadFrom(req: unknown): PayloadLike {
  return (req as { payload: PayloadLike }).payload;
}

async function findByID(
  payload: PayloadLike,
  args: Record<string, unknown>,
): Promise<ContentRecord | undefined> {
  try {
    return await payload.findByID(args);
  } catch {
    return undefined;
  }
}

export const validateTaskBeforePublish: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const document = mergedDocument(data, originalDoc);

  if (!isPublished(document)) {
    return data;
  }

  const payload = payloadFrom(req);
  const programmeId = relationshipId(document.programme);
  const moduleId = relationshipId(document.module);
  let programmeDurationDays: unknown;
  const errors = validateTaskFields(document, undefined, true);

  if (programmeId) {
    const programme = await findByID(payload, {
      collection: "programmes",
      depth: 0,
      id: programmeId,
      overrideAccess: true,
    });

    if (!programme) {
      errors.push("programme must reference an existing published programme");
    } else if (programme._status !== "published") {
      errors.push("programme must reference a published programme");
    }

    programmeDurationDays = programme?.durationDays;
    errors.push(
      ...validateTaskFields(document, programmeDurationDays, true).filter(
        (message) => !errors.includes(message),
      ),
    );
  } else {
    errors.push("programme is required");
  }

  if (moduleId && programmeId) {
    const moduleDocument = await findByID(payload, {
      collection: "modules",
      depth: 0,
      id: moduleId,
      overrideAccess: true,
    });
    const moduleProgrammeId = relationshipId(moduleDocument?.programme);

    if (!moduleDocument) {
      errors.push("module must reference an existing published module");
    } else if (moduleDocument._status !== "published") {
      errors.push("module must reference a published module");
    } else if (moduleProgrammeId !== programmeId) {
      errors.push("module must belong to the same programme as the task");
    }
  } else {
    errors.push("module is required");
  }

  if (
    programmeId &&
    isPositiveInteger(document.dayNumber) &&
    isPositiveInteger(document.orderWithinDay)
  ) {
    const duplicate = await payload.find({
      collection: "tasks",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        and: [
          { programme: { equals: programmeId } },
          { dayNumber: { equals: document.dayNumber } },
          { orderWithinDay: { equals: document.orderWithinDay } },
          ...(document.id ? [{ id: { not_equals: document.id } }] : []),
        ],
      },
    });

    if ((duplicate.totalDocs ?? duplicate.docs?.length ?? 0) > 0) {
      errors.push(
        "programme, dayNumber, and orderWithinDay must be unique together",
      );
    }
  }

  if (errors.length > 0) {
    throw validationError("tasks", errors);
  }

  return data;
};

export const validateProgrammeBeforePublish: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
}) => {
  const document = mergedDocument(data, originalDoc);

  if (!isPublished(document)) {
    return data;
  }

  const errors = validateProgrammeFields(document);
  if (errors.length > 0) {
    throw validationError("programmes", errors);
  }

  return data;
};

export const validateModuleBeforePublish: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const document = mergedDocument(data, originalDoc);

  if (!isPublished(document)) {
    return data;
  }

  const errors = validateModuleFields(document);
  const programmeId = relationshipId(document.programme);
  const payload = payloadFrom(req);

  if (programmeId) {
    const programme = await findByID(payload, {
      collection: "programmes",
      depth: 0,
      id: programmeId,
      overrideAccess: true,
    });

    if (!programme) {
      errors.push("programme must reference an existing published programme");
    } else if (programme._status !== "published") {
      errors.push("programme must reference a published programme");
    }
  }

  if (programmeId && isPositiveInteger(document.order)) {
    const duplicate = await payload.find({
      collection: "modules",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        and: [
          { programme: { equals: programmeId } },
          { order: { equals: document.order } },
          ...(document.id ? [{ id: { not_equals: document.id } }] : []),
        ],
      },
    });

    if ((duplicate.totalDocs ?? duplicate.docs?.length ?? 0) > 0) {
      errors.push("order must be unique within a programme");
    }
  }

  if (errors.length > 0) {
    throw validationError("modules", errors);
  }

  return data;
};

function templateMimeTypeOf(value: unknown): string | undefined {
  if (value && typeof value === "object" && "mimeType" in value) {
    const mimeType = (value as ContentRecord).mimeType;
    return typeof mimeType === "string" ? mimeType : undefined;
  }
  if (value && typeof value === "object" && "mime" in value) {
    const mime = (value as ContentRecord).mime;
    return typeof mime === "string" ? mime : undefined;
  }
  return undefined;
}

export const validateLessonBeforePublish: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const document = mergedDocument(data, originalDoc);

  if (!isPublished(document)) {
    return data;
  }

  const payload = payloadFrom(req);
  let templateMimeType = templateMimeTypeOf(document.templateFile);
  const templateFileId = relationshipId(document.templateFile);

  if (templateFileId && templateMimeType === undefined) {
    const media = await findByID(payload, {
      collection: "media",
      depth: 0,
      id: templateFileId,
      overrideAccess: true,
    });
    templateMimeType =
      typeof media?.mimeType === "string"
        ? media.mimeType
        : typeof media?.mime === "string"
          ? media.mime
          : undefined;
  }

  const errors = validateLessonFields(document, true, templateMimeType);
  if (errors.length > 0) {
    throw validationError("lessons", errors);
  }

  return data;
};
