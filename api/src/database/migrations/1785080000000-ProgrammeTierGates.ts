import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The two billing gates authored in the CMS, projected onto the mirrors.
 *
 * `programme.minimumTier` is the lowest billing tier that may start the
 * programme; `studio_lessons.paidOnly` withholds a lesson's body from Free.
 * Both are NOT NULL with an open default: a mirror row written before the
 * CMS carried the field stays open, and the app-side reader treats anything
 * unrecognised as "free" for the same reason — content drift may open a
 * programme, never lock everyone out of it.
 *
 * Grants are table-level (see 1784800000000-FirstTakeContentMirrors), so the
 * mirror writer and reader roles pick these columns up without a new GRANT.
 */
export class ProgrammeTierGates1785080000000 implements MigrationInterface {
  name = "ProgrammeTierGates1785080000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "programme"
      ADD COLUMN "minimumTier" text NOT NULL DEFAULT 'free'
    `);
    await queryRunner.query(`
      ALTER TABLE "programme"
      ADD CONSTRAINT "CHK_programme_minimum_tier"
      CHECK ("minimumTier" IN ('free', 'creator', 'pro'))
    `);
    await queryRunner.query(`
      ALTER TABLE "studio_lessons"
      ADD COLUMN "paidOnly" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "studio_lessons" DROP COLUMN IF EXISTS "paidOnly"
    `);
    await queryRunner.query(`
      ALTER TABLE "programme" DROP CONSTRAINT IF EXISTS "CHK_programme_minimum_tier"
    `);
    await queryRunner.query(`
      ALTER TABLE "programme" DROP COLUMN IF EXISTS "minimumTier"
    `);
  }
}
