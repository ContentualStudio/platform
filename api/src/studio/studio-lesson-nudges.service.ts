import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

export interface StudioLessonNudge {
  category: string;
  lessonIds: string[];
}

// A separate post-completion request keeps a failed optional nudge from rolling
// back (or misreporting) a successful task completion. One statement both checks
// context and claims the category; a unique key arbitrates concurrent devices.
const CLAIM_NUDGE_SQL = `
  WITH context AS (
    SELECT progress."contentType" AS category, progress."programmeId", programme."sourceDocumentId", served."programmeDay"
    FROM "programme_task_progress" progress
    JOIN "programme_enrolment" enrolment
      ON COALESCE(enrolment."assignmentId", enrolment."id") = progress."assignmentId"
      AND enrolment."userId" = progress."userId" AND enrolment."status" = 'active'
      AND enrolment."programmeSlug" = progress."programmeId"
    JOIN "programme_day_serve" served
      ON served."enrolmentId" = enrolment."id" AND served."userId" = progress."userId"
      AND served."taskId" = progress."taskId" AND served."localDate" = progress."localDate"
      AND served."outcome" = 'served'
    JOIN "programme" programme ON programme."slug" = progress."programmeId"
    LEFT JOIN "user_profile" profile ON profile."userId" = progress."userId"
    WHERE progress."userId" = $1 AND progress."taskId" = $2 AND progress."outcome" = 'completed'
      AND progress."localDate" = (now() AT TIME ZONE COALESCE(profile."timezone", 'UTC'))::date
      AND NULLIF(BTRIM(progress."contentType"), '') IS NOT NULL
    ORDER BY progress."recordedAt" DESC LIMIT 1
  ), lessons AS (
    SELECT lesson."slug", context.category
    FROM "studio_lessons" lesson CROSS JOIN context
    WHERE lesson."contentType" = context.category
      AND context."sourceDocumentId" = ANY(lesson."programmeRelevance")
      AND context."programmeDay" BETWEEN lesson."programmeDayStart" AND lesson."programmeDayEnd"
  ), claimed AS (
    INSERT INTO "studio_lesson_nudges" ("userId", "programmeId", "contentType")
    SELECT $1, context."programmeId", context.category FROM context
    WHERE EXISTS (SELECT 1 FROM lessons)
    ON CONFLICT ("userId", "programmeId", "contentType") DO NOTHING
    RETURNING "contentType"
  )
  SELECT claimed."contentType" AS category, array_agg(lessons."slug" ORDER BY lessons."slug") AS "lessonIds"
  FROM claimed JOIN lessons ON lessons.category = claimed."contentType"
  GROUP BY claimed."contentType"
`;

@Injectable()
export class StudioLessonNudgesService {
  constructor(private readonly dataSource: DataSource) {}

  async claimForCompletedTask(
    userId: string,
    taskId: string,
  ): Promise<StudioLessonNudge | null> {
    const [nudge] = (await this.dataSource.query(CLAIM_NUDGE_SQL, [
      userId,
      taskId,
    ])) as StudioLessonNudge[];
    return nudge ?? null;
  }
}
