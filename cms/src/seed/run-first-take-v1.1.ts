import { getPayload } from "payload";

import config from "../payload.config";
import { seedFirstTake } from "./first-take-v1.1";
import { closePayload } from "./close-payload";

function resourceMediaIdsFromEnv(): Record<string, number | string> | undefined {
  const encoded = process.env.FIRST_TAKE_RESOURCE_MEDIA_IDS;
  if (!encoded) {
    return undefined;
  }

  const parsed: unknown = JSON.parse(encoded);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("FIRST_TAKE_RESOURCE_MEDIA_IDS must be a JSON object");
  }

  return parsed as Record<string, number | string>;
}

async function main(): Promise<void> {
  const payload = await getPayload({ config });
  try {
    const result = await seedFirstTake(payload, {
      resourceMediaIds: resourceMediaIdsFromEnv(),
    });

    console.log(JSON.stringify(result, null, 2));
    for (const warning of result.warnings) {
      console.warn(`[first-take-seed] ${warning}`);
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
