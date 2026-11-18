import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Internal-team accounts, kept wholly apart from product users.
 *
 * The admin runs on its own Better Auth instance (see AdminAuthService), whose
 * four models are mapped onto these tables. Nothing here references "user":
 * an admin is not a creator with a flag, and a creator account can never be
 * promoted into the admin by a row elsewhere. Shapes mirror InitSchema's
 * Better Auth tables so the adapter sees the columns it expects.
 *
 * Accounts are created only by the `admin:account` script — the instance runs
 * with sign-up disabled, so there is no self-serve path into this table.
 */
export class AdminAuth1785170000000 implements MigrationInterface {
  name = "AdminAuth1785170000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "admin_account" (
        "id" text PRIMARY KEY,
        "name" text NOT NULL,
        "email" text NOT NULL,
        "emailVerified" boolean NOT NULL DEFAULT false,
        "image" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_admin_account_email" ON "admin_account" (lower("email"))`,
    );

    await queryRunner.query(`
      CREATE TABLE "admin_session" (
        "id" text PRIMARY KEY,
        "token" text NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "ipAddress" text,
        "userAgent" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "userId" text NOT NULL
          CONSTRAINT "FK_admin_session_account" REFERENCES "admin_account" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_admin_session_token" ON "admin_session" ("token")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_session_user" ON "admin_session" ("userId")`,
    );

    // Better Auth's "account" model (linked identity providers). Email-code
    // sign-in never writes it, but the adapter requires the model to exist.
    await queryRunner.query(`
      CREATE TABLE "admin_identity" (
        "id" text PRIMARY KEY,
        "accountId" text NOT NULL,
        "providerId" text NOT NULL,
        "userId" text NOT NULL
          CONSTRAINT "FK_admin_identity_account" REFERENCES "admin_account" ("id") ON DELETE CASCADE,
        "accessToken" text,
        "refreshToken" text,
        "idToken" text,
        "accessTokenExpiresAt" timestamptz,
        "refreshTokenExpiresAt" timestamptz,
        "scope" text,
        "password" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_identity_user" ON "admin_identity" ("userId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "admin_verification" (
        "id" text PRIMARY KEY,
        "identifier" text NOT NULL,
        "value" text NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_admin_verification_identifier" ON "admin_verification" ("identifier")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_verification_expires" ON "admin_verification" ("expiresAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_verification"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_identity"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_session"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_account"`);
  }
}
