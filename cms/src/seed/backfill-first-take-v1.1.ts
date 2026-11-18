import { getPayload } from "payload";

import config from "../payload.config";
import { backfillCollection } from "../content-sync/sync";
import { closePayload } from "./close-payload";

const collections = ["programmes", "lessons", "modules", "tasks"] as const;

async function main(): Promise<void> {
  if (!process.env.APP_MIRROR_DATABASE_URL) {
    throw new Error(
      "APP_MIRROR_DATABASE_URL is required to backfill the First Take mirror",
    );
  }

  const payload = await getPayload({ config });
  try {
    for (const collection of collections) {
      const mirroredDocuments = await backfillCollection(
        payload,
        collection,
        `first-take-seed-${collection}`,
      );
      console.log(`${collection}: ${mirroredDocuments} published documents mirrored`);
    }
  } finally {
    await closePayload(payload);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
