import { MigrationInterface, QueryRunner } from "typeorm";

const LEDGER_TABLES = [
  ["programme_task_progress", "FK_programme_task_progress_assignment"],
  ["programme_week_completion", "FK_programme_week_completion_assignment"],
  ["programme_completion", "FK_programme_completion_assignment"],
] as const;

/**
 * Journey history is filed under a ledger key (`ledgerKeyFor`): the matching
 * assignment's id, or the enrolment's id for a programme started from the
 * eligible list. The latter has no assignment row, so the foreign keys to
 * `programme_assignment` would reject every task it logs. The column stays
 * NOT NULL; only the reference to assignments goes.
 */
export class JourneyLedgerKeys1785100000000 implements MigrationInterface {
  name = "JourneyLedgerKeys1785100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, constraint] of LEDGER_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraint}"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // NOT VALID: rows filed under enrolment ids stay, and only new rows are
    // checked against assignments again.
    for (const [table, constraint] of LEDGER_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}"
           FOREIGN KEY ("assignmentId") REFERENCES "programme_assignment"("id") NOT VALID`,
      );
    }
  }
}
