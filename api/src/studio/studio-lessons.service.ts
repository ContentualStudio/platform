import { Injectable } from "@nestjs/common";
import { tierKeyOrFree, type TierKey } from "../billing/billing-tiers";
import { DataSource } from "typeorm";
import {
  lessonAccessible,
  type Entitlements,
} from "../billing/entitlement.service";

export interface StudioLessonSummary {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  attachmentsCount: number;
  /** Authored in the CMS: the lowest plan that opens the body and downloads. */
  minimumTier: TierKey;
  /** True when this user's plan does not open the body. Never hides the listing. */
  locked: boolean;
  lessonType: string | null;
  skillLevel: string | null;
  contentType: string | null;
  platforms: string[];
  programmeRelevance: string[];
  programmeDayStart: number | null;
  programmeDayEnd: number | null;
}

export type StudioLesson = StudioLessonSummary & {
  /**
   * The lesson body, or null when locked. Withheld on the server rather than
   * hidden in the UI, so the gate cannot be bypassed by reading the response.
   */
  body: unknown;
  attachmentsIds: string[];
  /** Withheld alongside the body when locked: body content, not a tag. */
  vimeoVideoId: string | null;
  /**
   * CMS media id for template lessons. Withheld alongside the body when
   * locked; the download URL is resolved from the id, as with attachments.
   */
  templateMediaId: string | null;
  templateUrl: string | null;
};

/** What the library listing needs: everything `summarise` reads, nothing else. */
interface StudioLessonSummaryRow {
  slug: string;
  sourceDocumentId: string;
  title: string;
  summary: string | null;
  attachmentsIds: string[] | null;
  minimumTier: string | null;
  lessonType: string | null;
  skillLevel: string | null;
  contentType: string | null;
  platforms: string[] | null;
  programmeRelevance: string[] | null;
  programmeDayStart: number | null;
  programmeDayEnd: number | null;
}

/** The listing row plus the body content only the single-lesson read returns. */
interface StudioLessonRow extends StudioLessonSummaryRow {
  body: unknown;
  vimeoVideoId: string | null;
  templateMediaId: string | null;
  templateUrl: string | null;
}

// The listing deliberately omits body: it is a Lexical jsonb document per
// lesson, and reading one for every row only to drop it in `summarise` costs
// the whole library's rich text on every list request.
const LESSON_SUMMARY_COLUMNS = `
  "slug", "sourceDocumentId", "title", "summary", "attachmentsIds", "minimumTier",
  "lessonType", "skillLevel", "contentType", "platforms", "programmeRelevance",
  "programmeDayStart", "programmeDayEnd"
`;

const LESSON_DETAIL_COLUMNS = `
  ${LESSON_SUMMARY_COLUMNS}, "body", "vimeoVideoId", "templateMediaId", "templateUrl"
`;

@Injectable()
export class StudioLessonsService {
  constructor(private readonly dataSource: DataSource) {}

  async listLessons(
    entitlements: Entitlements,
  ): Promise<StudioLessonSummary[]> {
    // Newest first, with the primary key as a total tiebreak: two lessons
    // published in the same sync transaction share a publishedAt to the
    // microsecond, and without the second key Postgres may return tied rows
    // in any order between requests. The client preserves array order
    // everywhere, so this sort is what makes the library deterministic.
    const rows = (await this.dataSource.query(`
      SELECT ${LESSON_SUMMARY_COLUMNS}
      FROM "studio_lessons"
      ORDER BY "publishedAt" DESC, "sourceDocumentId"
    `)) as StudioLessonSummaryRow[];

    return rows.map((row) => summarise(row, entitlements));
  }

  async findLesson(
    id: string,
    entitlements: Entitlements,
  ): Promise<StudioLesson | undefined> {
    const rows = (await this.dataSource.query(
      `
      SELECT ${LESSON_DETAIL_COLUMNS}
      FROM "studio_lessons"
      WHERE "slug" = $1 OR "sourceDocumentId" = $1
      LIMIT 1
    `,
      [id],
    )) as StudioLessonRow[];

    const row = rows[0];

    if (!row) {
      return undefined;
    }

    const summary = summarise(row, entitlements);

    return {
      ...summary,
      body: summary.locked ? null : row.body,
      attachmentsIds: summary.locked ? [] : (row.attachmentsIds ?? []),
      vimeoVideoId: summary.locked ? null : row.vimeoVideoId,
      templateMediaId: summary.locked ? null : row.templateMediaId,
      templateUrl: summary.locked ? null : (row.templateUrl ?? null),
    };
  }
}

function summarise(
  row: StudioLessonSummaryRow,
  entitlements: Entitlements,
): StudioLessonSummary {
  const minimumTier = tierKeyOrFree(row.minimumTier);

  return {
    id: row.slug || row.sourceDocumentId,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    attachmentsCount: row.attachmentsIds?.length ?? 0,
    minimumTier,
    locked: !lessonAccessible(entitlements, minimumTier),
    lessonType: row.lessonType ?? null,
    skillLevel: row.skillLevel ?? null,
    contentType: row.contentType ?? null,
    platforms: row.platforms ?? [],
    programmeRelevance: row.programmeRelevance ?? [],
    programmeDayStart: row.programmeDayStart ?? null,
    programmeDayEnd: row.programmeDayEnd ?? null,
  };
}
