import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1783682851869 implements MigrationInterface {
    name = 'InitSchema1783682851869'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Idempotent: this schema predates a migration-history rename, so the
        // tables may already exist in some environments. IF NOT EXISTS lets the
        // migration record itself as applied without recreating (and failing on)
        // existing objects.
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "account" ("id" text NOT NULL, "accountId" text NOT NULL, "providerId" text NOT NULL, "userId" text NOT NULL, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" TIMESTAMP WITH TIME ZONE, "refreshTokenExpiresAt" TIMESTAMP WITH TIME ZONE, "scope" text, "password" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_54115ee388cdb6d86bb4bf5b2ea" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_b1a9fdd281787a66a213f5b725" ON "account" ("accountId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_53a0af912032dcc48441566392" ON "account" ("providerId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_60328bf27019ff5498c4b97742" ON "account" ("userId") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "session" ("id" text NOT NULL, "token" text NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "ipAddress" text, "userAgent" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" text NOT NULL, CONSTRAINT "PK_f55da76ac1c3ac420f444d2ff11" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_232f8e85d7633bd6ddfad42169" ON "session" ("token") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_3d2f174ef04fb312fdebd0ddc5" ON "session" ("userId") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "user" ("id" text NOT NULL, "name" text NOT NULL, "email" text NOT NULL, "emailVerified" boolean NOT NULL DEFAULT false, "image" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_e12875dfb3b1d92d7d7c5377e2" ON "user" ("email") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "verification" ("id" text NOT NULL, "identifier" text NOT NULL, "value" text NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f7e3a90ca384e71d6e2e93bb340" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_896e5902333fa9991d1733e5ee" ON "verification" ("identifier") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_b2a48be969980ae537091ef582" ON "verification" ("expiresAt") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "user_profile" ("userId" text NOT NULL, "onboardingCompletedAt" TIMESTAMP WITH TIME ZONE, "userType" text, "region" text, "timezone" text, "platforms" text array, "experienceLevel" text, "postingFrequency" text, "mainGoal" text, "biggestChallenge" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_51cb79b5555effaf7d69ba1cff9" PRIMARY KEY ("userId"))`);
        // Postgres has no IF NOT EXISTS for ADD CONSTRAINT — guard it explicitly.
        await queryRunner.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_51cb79b5555effaf7d69ba1cff9') THEN ALTER TABLE "user_profile" ADD CONSTRAINT "FK_51cb79b5555effaf7d69ba1cff9" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION; END IF; END $$;`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_profile" DROP CONSTRAINT "FK_51cb79b5555effaf7d69ba1cff9"`);
        await queryRunner.query(`DROP TABLE "user_profile"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b2a48be969980ae537091ef582"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_896e5902333fa9991d1733e5ee"`);
        await queryRunner.query(`DROP TABLE "verification"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e12875dfb3b1d92d7d7c5377e2"`);
        await queryRunner.query(`DROP TABLE "user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3d2f174ef04fb312fdebd0ddc5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_232f8e85d7633bd6ddfad42169"`);
        await queryRunner.query(`DROP TABLE "session"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_60328bf27019ff5498c4b97742"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_53a0af912032dcc48441566392"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b1a9fdd281787a66a213f5b725"`);
        await queryRunner.query(`DROP TABLE "account"`);
    }

}
