import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Finishes the cutover for rows created before immutable programme content was
 * introduced. The best historical content available at deploy time is copied
 * once from the current mirror; after this migration, a live assignment never
 * has to follow the mutable slug mirror again.
 */
export class AssignmentAttemptsAndProgrammeVersions1784970000000
  implements MigrationInterface
{
  name = "AssignmentAttemptsAndProgrammeVersions1784970000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Older databases may already have applied the first version of
    // 178495, which briefly included this uniqueness constraint. Identical
    // content republished by an operator is still a distinct publication, so
    // the publication id—not content equality—is the identity.
    await queryRunner.query(`
      ALTER TABLE "programme_content_versions"
      DROP CONSTRAINT IF EXISTS "UQ_programme_content_versions_source_hash"
    `);
    await queryRunner.query(`
      ALTER TABLE "programme_assignment"
      ADD COLUMN "attemptId" text,
      ADD COLUMN "attemptActor" text,
      ADD COLUMN "attemptReason" text
    `);
    await queryRunner.query(`
      UPDATE "programme_assignment"
      SET "attemptId" = COALESCE("attemptId", 'legacy:' || "id"::text),
          "attemptActor" = COALESCE("attemptActor", 'migration'),
          "attemptReason" = COALESCE("attemptReason", 'legacy assignment')
    `);
    await queryRunner.query(`
      ALTER TABLE "programme_assignment"
      ALTER COLUMN "attemptId" SET NOT NULL,
      ALTER COLUMN "attemptActor" SET NOT NULL,
      ALTER COLUMN "attemptReason" SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_programme_assignment_user_attempt"
      ON "programme_assignment" ("userId", "attemptId")
    `);

    await queryRunner.query(`
      ALTER TABLE "challenge_setup"
      ADD COLUMN "assignedProgrammeVersionId" text
    `);

    // Never manufacture immutable history from the eventually consistent
    // mirror here. Before this migration runs, operations must materialize a
    // complete Payload graph through the CMS publisher for every assigned
    // programme. Existing rows are pinned to the newest such staged version;
    // the validation below aborts the migration if staging is incomplete.
    await queryRunner.query(`
      UPDATE "programme_assignment" a
      SET "programmeVersionId" = (
        SELECT v."programmeVersionId"
        FROM "programme_content_versions" v
        WHERE v."programmeKey" = a."programmeKey"
        ORDER BY v."createdAt" DESC, v."programmeVersionId" DESC
        LIMIT 1
      )
      WHERE NOT EXISTS (
          SELECT 1
          FROM "programme_content_versions" existing
          WHERE existing."programmeVersionId" = a."programmeVersionId"
            AND existing."programmeKey" = a."programmeKey"
        )
        AND EXISTS (
          SELECT 1
          FROM "programme_content_versions" staged
          WHERE staged."programmeKey" = a."programmeKey"
        )
    `);

    // Older releases stored the assignment only on challenge_setup. Preserve
    // that fact in the append-only history as well, with an explicit
    // backfill-attempt identity and a trace that says exactly what was and was
    // not available before versioned matching shipped.
    await queryRunner.query(`
      INSERT INTO "programme_assignment"
        ("userId", "programmeKey", "programmeVersionId", "attemptId",
         "attemptActor", "attemptReason", "setupVersionId", "winningRuleId",
         "fallbackUsed", "multipleRulesQualified", "structuredAnswers", "trace",
         "matchedAt", "active")
      SELECT
        s."userId",
        s."assignedProgrammeId",
        v."programmeVersionId",
        'legacy:setup:' || s."userId",
        'migration',
        'backfilled legacy assignment',
        COALESCE(s."matchAlgorithmVersion", 'legacy'),
        COALESCE(s."matchLeafId", 'legacy-assignment'),
        true,
        false,
        '{}'::jsonb,
        jsonb_build_object(
          'setupVersionId', COALESCE(s."matchAlgorithmVersion", 'legacy'),
          'selectedRuleId', COALESCE(s."matchLeafId", 'legacy-assignment'),
          'selectedRuleName', 'Legacy assignment',
          'selectedProgrammeKey', s."assignedProgrammeId",
          'selectedProgrammeVersionId', v."programmeVersionId",
          'explanation', 'Backfilled from the pre-versioned challenge setup assignment.',
          'fallbackUsed', true,
          'multipleRulesQualified', false,
          'qualifyingRuleIds', '[]'::jsonb,
          'considered', '[]'::jsonb
        ),
        COALESCE(s."programmeAssignedAt", s."setupCompletedAt", now()),
        true
      FROM "challenge_setup" s
      JOIN LATERAL (
        SELECT staged."programmeVersionId"
        FROM "programme_content_versions" staged
        WHERE staged."programmeKey" = s."assignedProgrammeId"
        ORDER BY staged."createdAt" DESC, staged."programmeVersionId" DESC
        LIMIT 1
      ) v ON true
      WHERE s."assignedProgrammeId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "programme_assignment" a
          WHERE a."userId" = s."userId"
            AND a."active" = true
        )
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      UPDATE "challenge_setup" s
      SET "assignedProgrammeVersionId" = a."programmeVersionId"
      FROM "programme_assignment" a
      WHERE a."userId" = s."userId"
        AND a."active" = true
    `);

    // Do not finish the cutover with a mixed population. A missing staged
    // Payload snapshot, an incomplete graph, or an old setup without a history
    // row is a deployment error that must be fixed before traffic is admitted.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "programme_content_versions" v
          WHERE (
            EXISTS (
              SELECT 1 FROM "programme_assignment" a
              WHERE a."programmeVersionId" = v."programmeVersionId"
            ) OR EXISTS (
              SELECT 1 FROM "challenge_setup" s
              WHERE s."assignedProgrammeVersionId" = v."programmeVersionId"
            )
          )
          AND (
            jsonb_typeof(v."snapshot"->'programme') <> 'object'
            OR jsonb_typeof(v."snapshot"->'modules') <> 'array'
            OR jsonb_typeof(v."snapshot"->'lessons') <> 'array'
            OR jsonb_typeof(v."snapshot"->'tasks') <> 'array'
            OR v."snapshot"->'programme'->>'key' IS DISTINCT FROM v."programmeKey"
            OR COALESCE(v."snapshot"->'programme'->>'id', '') = ''
            OR COALESCE(v."snapshot"->'programme'->>'title', '') = ''
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(v."snapshot"->'modules') module
              WHERE COALESCE(module->>'id', '') = ''
                 OR COALESCE(module->>'key', '') = ''
                 OR COALESCE(module->>'title', '') = ''
                 OR jsonb_typeof(module->'lessonIds') <> 'array'
                 OR EXISTS (
                   SELECT 1
                   FROM jsonb_array_elements_text(module->'lessonIds') lesson_id
                   WHERE NOT EXISTS (
                     SELECT 1
                     FROM jsonb_array_elements(v."snapshot"->'lessons') lesson
                     WHERE lesson->>'id' = lesson_id
                        OR lesson->>'key' = lesson_id
                   )
                 )
            )
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(v."snapshot"->'lessons') lesson
              WHERE COALESCE(lesson->>'id', '') = ''
                 OR COALESCE(lesson->>'key', '') = ''
                 OR COALESCE(lesson->>'title', '') = ''
            )
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(v."snapshot"->'tasks') task
              WHERE COALESCE(task->>'id', '') = ''
                 OR COALESCE(task->>'key', '') = ''
                 OR COALESCE(task->>'title', '') = ''
                 OR COALESCE(task->>'contentType', '') = ''
                 OR (task->>'moduleId' IS NOT NULL AND NOT EXISTS (
                   SELECT 1
                   FROM jsonb_array_elements(v."snapshot"->'modules') module
                   WHERE module->>'id' = task->>'moduleId'
                      OR module->>'key' = task->>'moduleId'
                 ))
                 OR (task->>'lessonId' IS NOT NULL AND NOT EXISTS (
                   SELECT 1
                   FROM jsonb_array_elements(v."snapshot"->'lessons') lesson
                   WHERE lesson->>'id' = task->>'lessonId'
                      OR lesson->>'key' = task->>'lessonId'
                 ))
            )
          )
        ) THEN
          RAISE EXCEPTION
            'Cannot finish programme version cutover: a staged immutable content snapshot is incomplete.';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM "programme_assignment" a
          LEFT JOIN "programme_content_versions" v
            ON v."programmeVersionId" = a."programmeVersionId"
          WHERE v."programmeVersionId" IS NULL
             OR v."programmeKey" <> a."programmeKey"
        ) THEN
          RAISE EXCEPTION
            'Cannot finish programme version cutover: an assignment has no matching immutable content snapshot.';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM "challenge_setup" s
          WHERE (s."assignedProgrammeId" IS NOT NULL
                 OR s."setupCompletedAt" IS NOT NULL)
            AND (
              s."assignedProgrammeVersionId" IS NULL
              OR NOT EXISTS (
                SELECT 1
                FROM "programme_content_versions" v
                WHERE v."programmeVersionId" = s."assignedProgrammeVersionId"
                  AND v."programmeKey" = s."assignedProgrammeId"
              )
            )
        ) THEN
          RAISE EXCEPTION
            'Cannot finish programme version cutover: a challenge setup has no immutable content snapshot.';
        END IF;
      END
      $$
    `);

    await queryRunner.query(`
      ALTER TABLE "programme_assignment"
      ADD CONSTRAINT "FK_programme_assignment_programme_version"
      FOREIGN KEY ("programmeVersionId")
      REFERENCES "programme_content_versions" ("programmeVersionId")
    `);
    await queryRunner.query(`
      ALTER TABLE "challenge_setup"
      ADD CONSTRAINT "FK_challenge_setup_assigned_programme_version"
      FOREIGN KEY ("assignedProgrammeVersionId")
      REFERENCES "programme_content_versions" ("programmeVersionId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_programme_assignment_user_attempt"`,
    );
    await queryRunner.query(`
      ALTER TABLE "programme_assignment"
      DROP CONSTRAINT IF EXISTS "FK_programme_assignment_programme_version"
    `);
    await queryRunner.query(`
      ALTER TABLE "challenge_setup"
      DROP CONSTRAINT IF EXISTS "FK_challenge_setup_assigned_programme_version"
    `);
    await queryRunner.query(
      `ALTER TABLE "challenge_setup" DROP COLUMN IF EXISTS "assignedProgrammeVersionId"`,
    );
    await queryRunner.query(`
      ALTER TABLE "programme_assignment"
      DROP COLUMN IF EXISTS "attemptReason",
      DROP COLUMN IF EXISTS "attemptActor",
      DROP COLUMN IF EXISTS "attemptId"
    `);
  }
}
