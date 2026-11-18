import { getPayload } from "payload";

import config from "../payload.config";
import { closePayload } from "./close-payload";
import { MatchingSeedError } from "./first-take-matching-v1";
import { seedProgrammeCatalogue } from "./programme-catalogue-v1";
import { seedCatalogueMatching } from "./programme-catalogue-matching-v1";
import { assertLocalDemoSeedEnvironment } from "./local-demo-seed-guard";

// Content first, then the rules that target it: a rule cannot be published
// against a programme that has not been published yet.
//
// Writes into two databases — Payload's for the content and the draft setup,
// the app's for the published snapshot — so both connection strings must be set.
async function main(): Promise<void> {
  // This catalogue contains deliberately minimal test curriculum. Refuse to
  // run before Payload can open either database unless both are loopback-only.
  assertLocalDemoSeedEnvironment(process.env);

  const payload = await getPayload({ config });

  try {
    const content = await seedProgrammeCatalogue(payload);
    const matching = await seedCatalogueMatching(payload);
    console.log(JSON.stringify({ content, matching }, null, 2));
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
