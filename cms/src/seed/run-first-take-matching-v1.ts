import { getPayload } from "payload";

import config from "../payload.config";
import {
  MatchingSeedError,
  seedFirstTakeMatching,
} from "./first-take-matching-v1";
import { closePayload } from "./close-payload";

// Writes into two databases — Payload's for the draft, the app's for the
// published snapshot — so both connection strings must be set:
//
async function main(): Promise<void> {
  const payload = await getPayload({ config });

  try {
    const result = await seedFirstTakeMatching(payload);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof MatchingSeedError) {
      console.error(error.message);
      for (const detail of error.errors) {
        console.error(`  - ${detail.message}`);
      }
      process.exitCode = 1;
      return;
    }

    throw error;
  } finally {
    await closePayload(payload);
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
