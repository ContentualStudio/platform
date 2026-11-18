import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Which recorded programme suggestions a user has dismissed.
 *
 * A separate table rather than a column on "engine_programme_suggestion": the
 * effect tables are the engine's record of what fired, and the modules that
 * surface them own no write path into them.
 *
 * Keyed by the suggestion row, not the programme. A later firing that suggests
 * the same programme again is a new suggestion and may surface; dismissing one
 * says nothing about the next.
 *
 * Acting on a suggestion is not stored here. Starting the programme is already
 * recorded as an enrolment, and the read derives "acted on" from that, so every
 * start path resolves the suggestion without having to know it exists.
 */
export class ProgrammeSuggestionDismissal1785130000000
  implements MigrationInterface
{
  name = "ProgrammeSuggestionDismissal1785130000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "programme_suggestion_dismissal" (
        "suggestionId" bigint NOT NULL,
        "userId" text NOT NULL,
        "dismissedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_programme_suggestion_dismissal" PRIMARY KEY ("suggestionId"),
        CONSTRAINT "FK_programme_suggestion_dismissal_suggestion"
          FOREIGN KEY ("suggestionId") REFERENCES "engine_programme_suggestion" ("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_programme_suggestion_dismissal_user"
          FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "programme_suggestion_dismissal"`,
    );
  }
}
