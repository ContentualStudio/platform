import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { s3Storage } from "@payloadcms/storage-s3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConfig } from "payload";

import { EngineBadges } from "./collections/EngineBadges";
import { EngineCallTypes } from "./collections/EngineCallTypes";
import { EngineRules } from "./collections/EngineRules";
import { Lessons } from "./collections/Lessons";
import { MatchingSetups } from "./collections/MatchingSetups";
import { Media } from "./collections/Media";
import { Modules } from "./collections/Modules";
import { Programmes } from "./collections/Programmes";
import { reconcileProgrammeEligibility } from "./collections/programme-lifecycle";
import { Tasks } from "./collections/Tasks";
import { Users } from "./collections/Users";
import { contentMirrorTasks } from "./content-sync/tasks";
import { contentMirrorBackfillEndpoint } from "./content-sync/backfill.endpoint";
import {
  matchingPublishEndpoint,
  matchingRestoreEndpoint,
  matchingVersionsEndpoint,
} from "./endpoints/matching-publish.endpoint";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

// This config is evaluated in three situations, only one of which is a real
// server boot:
//   1. `next build` collects page data before runtime secrets are injected.
//   2. Schema-only CLI commands (migrations, codegen) touch Postgres but never S3.
//   3. An actual boot.
// Deferring the throw in the first two keeps them runnable while still failing
// fast on a real boot with missing configuration. DATABASE_URL and PAYLOAD_SECRET
// stay strict for the CLI, since migrations cannot run without them.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const isSchemaCommand = process.env.PAYLOAD_SCHEMA_COMMAND === "true";
const isProduction = process.env.NODE_ENV === "production";

const requiredEnv = (name: string) => {
  const value = process.env[name];

  if (!value) {
    if (isBuildPhase) {
      return "";
    }

    throw new Error(`${name} is required`);
  }

  return value;
};

const s3Endpoint = process.env.AWS_S3_ENDPOINT;
const s3ForcePathStyle = process.env.AWS_S3_FORCE_PATH_STYLE === "true";
const cdnBaseUrl = (process.env.AWS_S3_CDN_BASE_URL ?? "").replace(/\/+$/, "");
const s3Bucket = process.env.AWS_S3_BUCKET_NAME ?? "";
const s3AccessKeyId = process.env.AWS_ACCESS_KEY_ID ?? "";
const s3SecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? "";

// S3 and the CDN are provisioned separately from this service. Production must
// never quietly fall back to disk, but local dev has to be runnable before that
// provisioning lands, so dev without S3 config stores uploads on disk instead.
const hasS3Config = Boolean(
  cdnBaseUrl && s3Bucket && s3AccessKeyId && s3SecretAccessKey,
);
const skipEnvChecks = isBuildPhase || isSchemaCommand;

if (!hasS3Config && isProduction && !skipEnvChecks) {
  throw new Error(
    "AWS_S3_CDN_BASE_URL, AWS_S3_BUCKET_NAME, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required in production",
  );
}

if (!hasS3Config && !skipEnvChecks) {
  console.warn(
    "[cms] S3 is not configured; storing uploads on local disk. Set the AWS_* vars to use S3 + CDN.",
  );
}

export default buildConfig({
  onInit: reconcileProgrammeEligibility,
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  // Engine Rules relates to the two catalogues, so they are registered first and
  // their slugs are known when the rule collection's relationships build.
  collections: [
    Users,
    Media,
    Lessons,
    Programmes,
    Modules,
    Tasks,
    EngineBadges,
    EngineCallTypes,
    EngineRules,
    MatchingSetups,
  ],
  db: postgresAdapter({
    pool: {
      connectionString: requiredEnv("DATABASE_URL"),
    },
    migrationDir: path.resolve(dirname, "migrations"),
  }),
  editor: lexicalEditor(),
  endpoints: [
    contentMirrorBackfillEndpoint,
    matchingPublishEndpoint,
    matchingVersionsEndpoint,
    matchingRestoreEndpoint,
  ],
  jobs: {
    // Retain successful jobs so content operators can inspect every publish
    // result alongside failures in the Payload admin UI.
    autoRun: [
      {
        cron: "* * * * *",
        limit: 10,
        queue: "content-mirror",
      },
    ],
    deleteJobOnComplete: false,
    tasks: contentMirrorTasks,
  },
  plugins: [
    s3Storage({
      enabled: hasS3Config,
      collections: {
        media: {
          prefix: "payload/media",
          // Serve media from the CDN rather than proxying bytes through Payload.
          disablePayloadAccessControl: true,
          generateFileURL: ({ filename, prefix }) =>
            [cdnBaseUrl, prefix, encodeURIComponent(filename)]
              .filter(Boolean)
              .join("/"),
        },
      },
      bucket: s3Bucket,
      config: {
        region: process.env.AWS_REGION ?? "us-east-1",
        endpoint: s3Endpoint || undefined,
        forcePathStyle: s3ForcePathStyle,
        credentials: {
          accessKeyId: s3AccessKeyId,
          secretAccessKey: s3SecretAccessKey,
        },
      },
    }),
  ],
  secret: requiredEnv("PAYLOAD_SECRET"),
  serverURL: process.env.PAYLOAD_PUBLIC_SERVER_URL,
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
});
