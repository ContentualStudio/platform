import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Keeps the admin user search fast as the user base grows.
 *
 * The search is a substring match (`lower(col) LIKE '%term%'`), which a
 * btree index cannot serve. Trigram GIN indexes can, on exactly the lower(...)
 * expressions AdminUsersService queries. Index-only: no column on Better
 * Auth's `user` table changes.
 *
 * Built without CONCURRENTLY because migrations run inside a transaction; at
 * today's row counts the brief write lock is immaterial.
 */
export class AdminUserSearchIndexes1785180000000 implements MigrationInterface {
  name = "AdminUserSearchIndexes1785180000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_name_trgm"
        ON "user" USING gin (lower("name") gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_email_trgm"
        ON "user" USING gin (lower("email") gin_trgm_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_email_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_name_trgm"`);
    // The extension is left in place: other objects may come to depend on it.
  }
}
