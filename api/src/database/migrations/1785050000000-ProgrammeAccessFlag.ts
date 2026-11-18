import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Whether a programme can be started by anyone, or only by a user the engine
 * has recorded an unlock for.
 *
 * NOT NULL DEFAULT 'open' because that is the truth about every programme
 * already published: nothing in Phase 1 is gated. Locking one is a content
 * edit from here on, not a deploy — which is the whole reason the flag exists
 * before anything uses it.
 */
export class ProgrammeAccessFlag1785050000000 implements MigrationInterface {
  name = "ProgrammeAccessFlag1785050000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "programme"
      ADD COLUMN "access" text NOT NULL DEFAULT 'open'
    `);

    // The same fail-closed vocabulary gate the other authored enums carry. A
    // value the eligible-programmes read cannot interpret is drift, and the
    // safe reading of an uninterpretable access flag is "locked" — so it is
    // refused at the boundary rather than guessed at on read.
    await queryRunner.query(`
      ALTER TABLE "programme"
      ADD CONSTRAINT "CHK_programme_access"
      CHECK ("access" IN ('open', 'locked'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "programme" DROP CONSTRAINT IF EXISTS "CHK_programme_access"
    `);
    await queryRunner.query(`
      ALTER TABLE "programme" DROP COLUMN IF EXISTS "access"
    `);
  }
}
