import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { tierKeyOrFree, type TierKey } from "../../billing/billing-tiers";
import type { SqlQueryable } from "../../database/queryable";
import type { Programme, ExpectationsCard, FounderVideo } from "./programme-content";
import type { ProgrammeTask } from "./programme-task-content";
import type {
  ProgrammeContentSnapshotLesson,
  ProgrammeContentSnapshotModule,
  ProgrammeContentSnapshotProgramme,
  ProgrammeContentSnapshotTask,
} from "./programme-content-version";
import { ProgrammeVersionRepository } from "./programme-version.repository";

export const PROGRAMME_CONTENT_READER = Symbol("PROGRAMME_CONTENT_READER");

export interface ProgrammeContentReader {
  findProgramme(
    key: string,
    queryable?: ProgrammeContentQueryable,
  ): Promise<Programme | undefined>;
  /**
   * Identity variant of the single-programme read: Studio For-you matching
   * keys off the mirror document id (what CMS relationships project), not the
   * slug (what every user-facing surface renders). Same read, both keys.
   */
  findProgrammeWithIdentity(
    key: string,
    queryable?: ProgrammeContentQueryable,
  ): Promise<ActiveProgramme | undefined>;
  /** Programmes offered for new enrolment / library — eligibility-gated. */
  listActiveProgrammes(
    queryable?: ProgrammeContentQueryable,
  ): Promise<Programme[]>;
  /**
   * The active set with each programme's mirror document id alongside it.
   *
   * Effect rows reference a programme by its `sourceDocumentId`, while
   * everything user-facing keys off the slug. A caller needing both gets them
   * from one read rather than querying the same eligibility-gated set twice.
   */
  listActiveProgrammesWithIdentity(
    queryable?: ProgrammeContentQueryable,
  ): Promise<ActiveProgramme[]>;
  tasksForProgramme(
    key: string,
    queryable?: ProgrammeContentQueryable,
  ): Promise<ProgrammeTask[]>;
  /** Linear delivery lookup: scheduled tasks for one programme day. */
  tasksForProgrammeDay(
    programmeKey: string,
    dayNumber: number,
    queryable?: ProgrammeContentQueryable,
  ): Promise<ProgrammeTask[]>;
  findProgrammeTask(
    programmeKey: string,
    taskKey: string,
    queryable?: ProgrammeContentQueryable,
  ): Promise<ProgrammeTask | undefined>;
  tasksForWeek(
    programmeKey: string,
    weekIndex: number,
    queryable?: ProgrammeContentQueryable,
  ): Promise<ProgrammeTask[]>;
  modulesForProgramme(
    key: string,
    queryable?: ProgrammeContentQueryable,
  ): Promise<ProgrammeModule[]>;
  lessonsForModule(
    programmeKey: string,
    moduleKey: string,
    queryable?: ProgrammeContentQueryable,
  ): Promise<ProgrammeLesson[]>;
  contentForProgramme(
    key: string,
    queryable?: ProgrammeContentQueryable,
  ): Promise<ProgrammeContent | undefined>;

  /** Exact-version reads used by assignments created after the cutover. */
  findProgrammeVersion(
    programmeVersionId: string,
    queryable?: ProgrammeContentQueryable,
  ): Promise<Programme | undefined>;
  /** Identity variant of the exact-version read; see findProgrammeWithIdentity. */
  findProgrammeVersionWithIdentity(
    programmeVersionId: string,
    queryable?: ProgrammeContentQueryable,
  ): Promise<ActiveProgramme | undefined>;
  tasksForProgrammeVersion(
    programmeVersionId: string,
    queryable?: ProgrammeContentQueryable,
  ): Promise<ProgrammeTask[]>;
  tasksForProgrammeDayVersion(
    programmeVersionId: string,
    dayNumber: number,
    queryable?: ProgrammeContentQueryable,
  ): Promise<ProgrammeTask[]>;
  findProgrammeTaskForVersion(
    programmeVersionId: string,
    taskKey: string,
    queryable?: ProgrammeContentQueryable,
  ): Promise<ProgrammeTask | undefined>;
  tasksForWeekVersion(
    programmeVersionId: string,
    weekIndex: number,
    queryable?: ProgrammeContentQueryable,
  ): Promise<ProgrammeTask[]>;
  modulesForProgrammeVersion(
    programmeVersionId: string,
    queryable?: ProgrammeContentQueryable,
  ): Promise<ProgrammeModule[]>;
  lessonsForModuleVersion(
    programmeVersionId: string,
    moduleKey: string,
    queryable?: ProgrammeContentQueryable,
  ): Promise<ProgrammeLesson[]>;
  contentForProgrammeVersion(
    programmeVersionId: string,
    queryable?: ProgrammeContentQueryable,
  ): Promise<ProgrammeContent | undefined>;
}

export type ProgrammeContentQueryable = SqlQueryable;

export interface ActiveProgramme {
  programme: Programme;
  /** The mirror key effect rows and CMS references carry. */
  sourceDocumentId: string;
}

export interface ProgrammeMirrorRow {
  access: string | null;
  ctaText: string | null;
  description: string | null;
  difficulty: string | number | null;
  durationDays: number | null;
  expectations: unknown;
  experienceLevel: string | null;
  founderVideoUrl: string | null;
  insightMoments: unknown;
  milestones: unknown;
  slug: string;
  sourceDocumentId: string;
  title: string;
  track: string | null;
  minimumTier?: string | null;
}

export interface ProgrammeTaskMirrorRow {
  contentType?: string | null;
  dayNumber: number | null;
  dayType: string | null;
  instructions: unknown;
  lessonId: string | null;
  moduleId: string | null;
  orderWithinDay: number | null;
  cameraRequired: boolean;
  objective: string | null;
  openingLine: string | null;
  outputDescription: unknown;
  pausePrompt: unknown;
  platform: string | null;
  postNumber: number | null;
  whyItMatters: unknown;
  programmeId: string | null;
  publishSlot: boolean;
  slug: string;
  sourceDocumentId: string;
  timeEstimateMinutes: number | null;
  title: string;
}

export interface ProgrammeModuleMirrorRow {
  lessonIds: string[] | null;
  moduleOrder: number | null;
  programmeId: string | null;
  slug: string;
  sourceDocumentId: string;
  title: string;
}

export interface ProgrammeLessonMirrorRow {
  attachmentsIds: string[] | null;
  body: unknown;
  minimumTier?: string | null;
  slug: string;
  sourceDocumentId: string;
  summary: string | null;
  title: string;
}

export interface ProgrammeLesson {
  id: string;
  title: string;
  summary: string | null;
  body: unknown;
  attachmentsIds: string[];
  /** Lowest plan that opens the body and downloads; the listing is open to all. */
  minimumTier: TierKey;
}

export interface ProgrammeModule {
  id: string;
  title: string;
  order: number;
  programmeId: string;
  lessons: ProgrammeLesson[];
}

export interface ProgrammeContent {
  programme: Programme;
  modules: ProgrammeModule[];
  tasks: ProgrammeTask[];
}

const PROGRAMME_SELECT_COLUMNS = `
  programme."access", programme."ctaText", programme."description", programme."difficulty",
  programme."durationDays", programme."expectations", programme."experienceLevel",
  programme."founderVideoUrl", programme."insightMoments", programme."milestones",
  programme."slug", programme."sourceDocumentId", programme."title", programme."track",
  programme."minimumTier"
`;

const PROGRAMME_SQL = `
  SELECT
    "access", "ctaText", "description", "difficulty", "durationDays",
    "expectations", "experienceLevel", "founderVideoUrl",
    "insightMoments", "milestones", "slug",
    "sourceDocumentId", "title", "track", "minimumTier"
  FROM "programme"
  WHERE ("slug" = $1 OR "sourceDocumentId" = $1)
  LIMIT 1
`;

// Eligibility is the fail-closed "active" gate for new enrolment / library.
const LIST_ACTIVE_PROGRAMMES_SQL = `
  SELECT ${PROGRAMME_SELECT_COLUMNS}
  FROM "programme" AS programme
  JOIN "programme_matching_target_eligibility" AS eligibility
    ON eligibility."sourceDocumentId" = programme."sourceDocumentId"
  WHERE eligibility."eligible" = true
  ORDER BY programme."slug", programme."sourceDocumentId"
`;

const TASK_SELECT_SQL = `
  SELECT
    task."cameraRequired", task."contentType", task."dayNumber", task."dayType",
    task."instructions", task."lessonId", task."moduleId", task."objective",
    task."openingLine", task."orderWithinDay", task."outputDescription",
    task."pausePrompt", task."platform", task."postNumber",
    task."programmeId", task."publishSlot", task."slug",
    task."sourceDocumentId", task."timeEstimateMinutes", task."title",
    task."whyItMatters"
  FROM "programme_tasks" AS task
  JOIN "programme" AS programme
    ON programme."sourceDocumentId" = task."programmeId"
    OR (
      task."programmeId" IS NULL
      AND task."lessonId" = ANY(programme."lessonIds")
    )
  LEFT JOIN "programme_modules" AS module_row
    ON module_row."sourceDocumentId" = task."moduleId"
  WHERE (programme."slug" = $1 OR programme."sourceDocumentId" = $1)
    AND task."dayNumber" IS NOT NULL
    AND task."orderWithinDay" IS NOT NULL
    AND NULLIF(BTRIM(task."contentType"), '') IS NOT NULL
    AND (
      task."moduleId" IS NULL
      OR module_row."programmeId" = programme."sourceDocumentId"
    )
`;

const MODULE_SELECT_SQL = `
  SELECT
    module_row."lessonIds", module_row."moduleOrder",
    module_row."programmeId", module_row."slug",
    module_row."sourceDocumentId", module_row."title"
  FROM "programme_modules" AS module_row
  JOIN "programme" AS programme
    ON programme."sourceDocumentId" = module_row."programmeId"
  WHERE (programme."slug" = $1 OR programme."sourceDocumentId" = $1)
  ORDER BY module_row."moduleOrder", module_row."sourceDocumentId"
`;

const LESSON_SELECT_SQL = `
  SELECT
    lesson."attachmentsIds", lesson."body", lesson."minimumTier", lesson."slug",
    lesson."sourceDocumentId", lesson."summary", lesson."title"
  FROM "studio_lessons" AS lesson
  WHERE lesson."sourceDocumentId" = ANY($1::text[])
     OR lesson."slug" = ANY($1::text[])
`;

const TASK_ORDER_SQL = `
  ORDER BY task."dayNumber", task."orderWithinDay", task."sourceDocumentId"
`;

function plainText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;
  const ownText = typeof record.text === "string" ? record.text : "";
  const children = Array.isArray(record.children)
    ? record.children.map(plainText).filter(Boolean).join(" ")
    : "";
  const root = record.root ? plainText(record.root) : "";

  return [ownText, children, root].filter(Boolean).join(" ").trim();
}

function founderVideo(value: string | null): FounderVideo | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/(?:vimeo\.com\/(?:video\/)?)?(\d{4,})/);

  if (!match) {
    return undefined;
  }

  return { title: "A word from our founder", vimeoId: match[1] };
}

// Fail closed: an access value the reader cannot interpret is drift in the
// mirror, and the safe reading of an uninterpretable flag is "locked" — an
// open default would offer a programme the content team meant to gate.
function programmeAccess(value: string | null): "open" | "locked" {
  return value === "open" ? "open" : "locked";
}

function difficultyNumber(value: string | number | null): number {
  if (typeof value === "number") {
    return value;
  }

  return value === "easy" ? 1 : value === "hard" ? 5 : 3;
}

function levelName(
  value: string | null,
): "Beginner" | "Intermediate" | "Advanced" {
  return value === "advanced"
    ? "Advanced"
    : value === "intermediate"
      ? "Intermediate"
      : "Beginner";
}

function expectations(value: unknown): ExpectationsCard | undefined {
  const body = plainText(value);
  return body
    ? { title: "What to honestly expect", body }
    : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function taskDayType(
  value: string | null,
): "push" | "protect" | "recharge" | null {
  return value === "push" || value === "protect" || value === "recharge"
    ? value
    : null;
}

// Fail closed the same way taskDayType does: a value the card has no chip for
// is drift in the mirror, not content to render.
const TASK_PLATFORMS = [
  "instagram",
  "tiktok",
  "youtube",
  "linkedin",
  "facebook",
  "x",
  "pinterest",
] as const;

function taskPlatform(value: string | null): string | null {
  return TASK_PLATFORMS.includes(value as (typeof TASK_PLATFORMS)[number])
    ? value
    : null;
}

function sortTasks(tasks: ProgrammeTask[]): ProgrammeTask[] {
  return [...tasks].sort(
    (left, right) =>
      (left.dayNumber ?? Number.MAX_SAFE_INTEGER) -
        (right.dayNumber ?? Number.MAX_SAFE_INTEGER) ||
      (left.orderWithinDay ?? Number.MAX_SAFE_INTEGER) -
        (right.orderWithinDay ?? Number.MAX_SAFE_INTEGER) ||
      left.id.localeCompare(right.id),
  );
}

/**
 * Every value here comes from the mirror row and nothing else.
 *
 * This used to fall back to the authored catalogue in `programme-content.ts`
 * by slug, which put four real programme slugs and their copy on the
 * production read path: a programme the content team renamed, re-described or
 * re-levelled in Payload would keep serving the hardcoded text, and a
 * programme absent from that file got different treatment from one present in
 * it. A field the mirror does not carry is now simply absent, which is what
 * the Welcome Page already handles.
 */
function mapProgramme(row: ProgrammeMirrorRow): Programme {
  const durationDays = Number(row.durationDays ?? 0);
  const slug = row.slug || row.sourceDocumentId;
  const durationLabel = durationDays
    ? `${durationDays} ${durationDays === 1 ? "day" : "days"}`
    : "";

  return {
    id: slug,
    title: row.title,
    access: programmeAccess(row.access),
    description: row.description ?? "",
    features: durationDays
      ? [{ icon: "clock", label: `${durationLabel} programme` }]
      : [],
    difficulty: difficultyNumber(row.difficulty),
    level: levelName(row.experienceLevel),
    durationLabel,
    durationDays,
    founderVideo: founderVideo(row.founderVideoUrl),
    expectations: expectations(row.expectations),
    ctaText: row.ctaText ?? undefined,
    track: row.track ?? undefined,
    minimumTier: tierKeyOrFree(row.minimumTier),
    milestones: arrayValue(row.milestones),
    insightMoments: arrayValue(row.insightMoments),
  };
}

function mapTask(row: ProgrammeTaskMirrorRow): ProgrammeTask | undefined {
  if (
    typeof row.dayNumber !== "number" ||
    typeof row.orderWithinDay !== "number" ||
    typeof row.contentType !== "string" ||
    row.contentType.trim().length === 0
  ) {
    return undefined;
  }

  return {
    id: row.slug || row.sourceDocumentId,
    title: row.title,
    contentType: row.contentType,
    weekIndex: Math.ceil(row.dayNumber / 7),
    dayIndex: ((row.dayNumber - 1) % 7) + 1,
    moduleId: row.moduleId,
    lessonId: row.lessonId,
    dayNumber: row.dayNumber,
    orderWithinDay: row.orderWithinDay,
    dayType: taskDayType(row.dayType),
    timeEstimateMinutes: row.timeEstimateMinutes,
    publishSlot: row.publishSlot,
    postNumber: row.postNumber,
    platform: taskPlatform(row.platform),
    cameraRequired: row.cameraRequired === true,
    objective: row.objective,
    openingLine: row.openingLine,
    whyItMatters: row.whyItMatters,
    pausePrompt: row.pausePrompt,
    outputDescription: row.outputDescription,
    instructions: row.instructions,
  };
}

function mapLesson(row: ProgrammeLessonMirrorRow): ProgrammeLesson {
  return {
    id: row.slug || row.sourceDocumentId,
    title: row.title,
    summary: row.summary,
    body: row.body,
    attachmentsIds: row.attachmentsIds ?? [],
    minimumTier: tierKeyOrFree(row.minimumTier),
  };
}

function mapModule(
  row: ProgrammeModuleMirrorRow,
  lessons: ProgrammeLesson[],
): ProgrammeModule | undefined {
  if (
    typeof row.moduleOrder !== "number" ||
    typeof row.programmeId !== "string"
  ) {
    return undefined;
  }

  return {
    id: row.slug || row.sourceDocumentId,
    title: row.title,
    order: row.moduleOrder,
    programmeId: row.programmeId,
    lessons,
  };
}

@Injectable()
export class ProgrammeContentRepository implements ProgrammeContentReader {
  private readonly versions: ProgrammeVersionRepository;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    this.versions = new ProgrammeVersionRepository(dataSource);
  }

  // One read, two shapes: the plain variant drops the identity the mirror row
  // already carried, so it delegates rather than repeating the query.
  async findProgramme(
    key: string,
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<Programme | undefined> {
    return (await this.findProgrammeWithIdentity(key, queryable))?.programme;
  }

  async findProgrammeWithIdentity(
    key: string,
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<ActiveProgramme | undefined> {
    const rows = (await queryable.query(PROGRAMME_SQL, [key])) as ProgrammeMirrorRow[];
    const row = rows[0];

    if (!row) {
      return undefined;
    }

    return { programme: mapProgramme(row), sourceDocumentId: row.sourceDocumentId };
  }

  async listActiveProgrammes(
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<Programme[]> {
    const rows = (await queryable.query(
      LIST_ACTIVE_PROGRAMMES_SQL,
    )) as ProgrammeMirrorRow[];

    return rows.map(mapProgramme);
  }

  async listActiveProgrammesWithIdentity(
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<ActiveProgramme[]> {
    const rows = (await queryable.query(
      LIST_ACTIVE_PROGRAMMES_SQL,
    )) as ProgrammeMirrorRow[];

    return rows.map((row) => ({
      programme: mapProgramme(row),
      sourceDocumentId: row.sourceDocumentId,
    }));
  }

  async tasksForProgramme(
    key: string,
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<ProgrammeTask[]> {
    const rows = (await queryable.query(
      `${TASK_SELECT_SQL}${TASK_ORDER_SQL}`,
      [key],
    )) as ProgrammeTaskMirrorRow[];

    return sortTasks(
      rows
        .map(mapTask)
        .filter((task): task is ProgrammeTask => task !== undefined),
    );
  }

  async tasksForProgrammeDay(
    programmeKey: string,
    dayNumber: number,
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<ProgrammeTask[]> {
    if (!Number.isInteger(dayNumber) || dayNumber < 1) {
      return [];
    }

    const rows = (await queryable.query(
      `${TASK_SELECT_SQL}
        AND task."dayNumber" = $2
       ${TASK_ORDER_SQL}`,
      [programmeKey, dayNumber],
    )) as ProgrammeTaskMirrorRow[];

    return sortTasks(
      rows
        .map(mapTask)
        .filter((task): task is ProgrammeTask => task !== undefined),
    );
  }

  async findProgrammeTask(
    programmeKey: string,
    taskKey: string,
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<ProgrammeTask | undefined> {
    const rows = (await queryable.query(
      `${TASK_SELECT_SQL}
        AND (task."slug" = $2 OR task."sourceDocumentId" = $2)
        LIMIT 1`,
      [programmeKey, taskKey],
    )) as ProgrammeTaskMirrorRow[];

    return rows.map(mapTask).find((task): task is ProgrammeTask => task !== undefined);
  }

  async tasksForWeek(
    programmeKey: string,
    weekIndex: number,
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<ProgrammeTask[]> {
    return (await this.tasksForProgramme(programmeKey, queryable)).filter(
      (task) => task.weekIndex === weekIndex,
    );
  }

  async modulesForProgramme(
    key: string,
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<ProgrammeModule[]> {
    const rows = (await queryable.query(MODULE_SELECT_SQL, [key])) as ProgrammeModuleMirrorRow[];
    const modules: ProgrammeModule[] = [];

    for (const row of rows) {
      const lessonIds = row.lessonIds ?? [];
      const lessons = await this.lessonsForIds(lessonIds, queryable);

      // A published module with a missing published lesson is not valid beta
      // content. Omit the whole module so clients never receive a partial tree.
      if (lessons.length !== lessonIds.length) {
        continue;
      }

      const module = mapModule(row, lessons);
      if (module) {
        modules.push(module);
      }
    }

    return modules.sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    );
  }

  async lessonsForModule(
    programmeKey: string,
    moduleKey: string,
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<ProgrammeLesson[]> {
    const rows = (await queryable.query(MODULE_SELECT_SQL, [programmeKey])) as ProgrammeModuleMirrorRow[];
    const module = rows.find(
      (row) => row.slug === moduleKey || row.sourceDocumentId === moduleKey,
    );

    if (!module) {
      return [];
    }

    const lessonIds = module.lessonIds ?? [];
    const lessons = await this.lessonsForIds(lessonIds, queryable);
    return lessons.length === lessonIds.length ? lessons : [];
  }

  async contentForProgramme(
    key: string,
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<ProgrammeContent | undefined> {
    const programme = await this.findProgramme(key, queryable);
    if (!programme) {
      return undefined;
    }

    const [modules, tasks] = await Promise.all([
      this.modulesForProgramme(key, queryable),
      this.tasksForProgramme(key, queryable),
    ]);

    return { programme, modules, tasks };
  }

  async findProgrammeVersion(
    programmeVersionId: string,
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<Programme | undefined> {
    return (
      await this.findProgrammeVersionWithIdentity(programmeVersionId, queryable)
    )?.programme;
  }

  async findProgrammeVersionWithIdentity(
    programmeVersionId: string,
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<ActiveProgramme | undefined> {
    const version = await this.versions.findById(programmeVersionId, queryable);

    if (!version) {
      return undefined;
    }

    // The snapshot carries the mirror document id as its programme id
    // (mapSnapshotProgramme maps it to sourceDocumentId), so identity
    // survives versioning without a second read.
    return {
      programme: mapSnapshotProgramme(version.snapshot.programme),
      sourceDocumentId: version.snapshot.programme.id,
    };
  }

  async tasksForProgrammeVersion(
    programmeVersionId: string,
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<ProgrammeTask[]> {
    const version = await this.versions.findById(programmeVersionId, queryable);
    return version ? mapSnapshotTasks(version.snapshot.tasks) : [];
  }

  async tasksForProgrammeDayVersion(
    programmeVersionId: string,
    dayNumber: number,
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<ProgrammeTask[]> {
    if (!Number.isInteger(dayNumber) || dayNumber < 1) {
      return [];
    }

    return (await this.tasksForProgrammeVersion(programmeVersionId, queryable)).filter(
      (task) => task.dayNumber === dayNumber,
    );
  }

  async findProgrammeTaskForVersion(
    programmeVersionId: string,
    taskKey: string,
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<ProgrammeTask | undefined> {
    const version = await this.versions.findById(programmeVersionId, queryable);

    if (!version) {
      return undefined;
    }

    const task = version.snapshot.tasks.find(
      (candidate) => candidate.id === taskKey || candidate.key === taskKey,
    );

    return task ? mapTaskFromSnapshot(task) : undefined;
  }

  async tasksForWeekVersion(
    programmeVersionId: string,
    weekIndex: number,
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<ProgrammeTask[]> {
    return (await this.tasksForProgrammeVersion(programmeVersionId, queryable)).filter(
      (task) => task.weekIndex === weekIndex,
    );
  }

  async modulesForProgrammeVersion(
    programmeVersionId: string,
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<ProgrammeModule[]> {
    const version = await this.versions.findById(programmeVersionId, queryable);

    if (!version) {
      return [];
    }

    const lessons = new Map(
      version.snapshot.lessons.map((lesson) => [lesson.id, mapSnapshotLesson(lesson)]),
    );

    return version.snapshot.modules
      .map((module) => mapSnapshotModule(module, lessons))
      .filter((module): module is ProgrammeModule => module !== undefined)
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  }

  async lessonsForModuleVersion(
    programmeVersionId: string,
    moduleKey: string,
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<ProgrammeLesson[]> {
    const version = await this.versions.findById(programmeVersionId, queryable);
    const module = version?.snapshot.modules.find(
      (candidate) => candidate.id === moduleKey || candidate.key === moduleKey,
    );

    if (!version || !module) {
      return [];
    }

    const byId = new Map(
      version.snapshot.lessons.map((lesson) => [lesson.id, mapSnapshotLesson(lesson)]),
    );
    const lessons = module.lessonIds
      .map((lessonId) => byId.get(lessonId))
      .filter((lesson): lesson is ProgrammeLesson => lesson !== undefined);

    return lessons.length === module.lessonIds.length ? lessons : [];
  }

  async contentForProgrammeVersion(
    programmeVersionId: string,
    queryable: ProgrammeContentQueryable = this.dataSource,
  ): Promise<ProgrammeContent | undefined> {
    const version = await this.versions.findById(programmeVersionId, queryable);

    if (!version) {
      return undefined;
    }

    const programme = mapSnapshotProgramme(version.snapshot.programme);
    const modules = await this.modulesForProgrammeVersion(
      programmeVersionId,
      queryable,
    );
    const tasks = mapSnapshotTasks(version.snapshot.tasks);
    return { programme, modules, tasks };
  }

  private async lessonsForIds(
    lessonIds: string[],
    queryable: ProgrammeContentQueryable,
  ): Promise<ProgrammeLesson[]> {
    if (lessonIds.length === 0) {
      return [];
    }

    const rows = (await queryable.query(LESSON_SELECT_SQL, [lessonIds])) as ProgrammeLessonMirrorRow[];
    const byId = new Map<string, ProgrammeLessonMirrorRow>();
    for (const row of rows) {
      byId.set(row.sourceDocumentId, row);
      byId.set(row.slug, row);
    }

    return lessonIds
      .map((id) => byId.get(id))
      .filter((row): row is ProgrammeLessonMirrorRow => Boolean(row))
      .map(mapLesson);
  }
}

function mapSnapshotProgramme(row: ProgrammeContentSnapshotProgramme): Programme {
  return mapProgramme({
    access: row.access,
    ctaText: row.ctaText,
    description: row.description,
    difficulty: row.difficulty,
    durationDays: row.durationDays,
    expectations: row.expectations,
    experienceLevel: row.experienceLevel,
    founderVideoUrl: row.founderVideoUrl,
    insightMoments: row.insightMoments,
    milestones: row.milestones,
    slug: row.key,
    sourceDocumentId: row.id,
    title: row.title,
    track: row.track,
    minimumTier: row.minimumTier ?? null,
  });
}

function mapSnapshotTasks(rows: ProgrammeContentSnapshotTask[]): ProgrammeTask[] {
  return rows
    .map(mapTaskFromSnapshot)
    .filter((task): task is ProgrammeTask => task !== undefined)
    .sort(
      (left, right) =>
        (left.dayNumber ?? Number.MAX_SAFE_INTEGER) -
          (right.dayNumber ?? Number.MAX_SAFE_INTEGER) ||
        (left.orderWithinDay ?? Number.MAX_SAFE_INTEGER) -
          (right.orderWithinDay ?? Number.MAX_SAFE_INTEGER) ||
        left.id.localeCompare(right.id),
    );
}

function mapTaskFromSnapshot(
  row: ProgrammeContentSnapshotTask,
): ProgrammeTask | undefined {
  return mapTask({
    cameraRequired: row.cameraRequired,
    contentType: row.contentType,
    dayNumber: row.dayNumber,
    dayType: row.dayType,
    instructions: row.instructions,
    lessonId: row.lessonId,
    moduleId: row.moduleId,
    objective: row.objective,
    openingLine: row.openingLine,
    orderWithinDay: row.orderWithinDay,
    outputDescription: row.outputDescription,
    pausePrompt: row.pausePrompt,
    platform: row.platform,
    postNumber: row.postNumber,
    programmeId: row.programmeId,
    publishSlot: row.publishSlot,
    slug: row.key,
    sourceDocumentId: row.id,
    timeEstimateMinutes: row.timeEstimateMinutes,
    title: row.title,
    whyItMatters: row.whyItMatters,
  });
}

function mapSnapshotLesson(row: ProgrammeContentSnapshotLesson): ProgrammeLesson {
  return mapLesson({
    attachmentsIds: row.attachmentsIds,
    body: row.body,
    minimumTier: row.minimumTier ?? (row.paidOnly ? "creator" : null),
    slug: row.key,
    sourceDocumentId: row.id,
    summary: row.summary,
    title: row.title,
  });
}

function mapSnapshotModule(
  row: ProgrammeContentSnapshotModule,
  lessons: Map<string, ProgrammeLesson>,
): ProgrammeModule | undefined {
  const moduleLessons = row.lessonIds
    .map((lessonId) => lessons.get(lessonId))
    .filter((lesson): lesson is ProgrammeLesson => lesson !== undefined);

  if (moduleLessons.length !== row.lessonIds.length) {
    return undefined;
  }

  return {
    id: row.key,
    title: row.title,
    order: row.order,
    programmeId: row.programmeId,
    lessons: moduleLessons,
  };
}
