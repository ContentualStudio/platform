import "reflect-metadata";
import type { PublishedMatchingSetup } from "@contentual/programme-matching-vocabulary";
import { ProgrammeContentRepository } from "../challenge-setup/programmes/programme-content.repository";
import {
  MatchingConfigurationError,
  ProgrammeMatchingRepository,
} from "../challenge-setup/programmes/programme-matching.repository";
import dataSource from "../database/data-source";

/**
 * Operational gate: prove the *currently published* matching setup can
 * actually assign someone.
 *
 * Its predecessor read the released code's decision tree, which stopped being
 * the right question the moment rules became content — a release no longer
 * changes who matches what, and publishing does. So this reads the one active
 * snapshot from the database and checks the two things that would otherwise
 * surface as a 500 for every user completing onboarding: that the snapshot
 * loads and validates at all, and that every programme it can return exists as
 * published content.
 *
 * Safe to run against production at any time; it only reads.
 */
export interface PublicationCheck {
  findProgramme(key: string): Promise<unknown | undefined>;
}

export interface SetupSource {
  loadActiveSetup(): Promise<PublishedMatchingSetup>;
}

export interface MatchingVerificationReport {
  ok: boolean;
  setupVersionId: string | null;
  fallbackProgrammeKey: string | null;
  // Every programme an active rule (or the fallback) can return, and which of
  // them have no published content behind them.
  checked: string[];
  missing: string[];
  errors: string[];
}

function reachableProgrammeKeys(setup: PublishedMatchingSetup): string[] {
  const keys = setup.rules
    .filter((rule) => rule.active || rule.fallback)
    .map((rule) => rule.programmeKey);

  return [...new Set(keys)];
}

export async function verifyPublishedMatching(
  setups: SetupSource,
  content: PublicationCheck,
): Promise<MatchingVerificationReport> {
  let setup: PublishedMatchingSetup;

  try {
    setup = await setups.loadActiveSetup();
  } catch (error) {
    // A missing or corrupt setup is the whole failure — there is nothing left
    // to check — so it is reported as one error rather than rethrown, which
    // lets the caller print it next to a non-zero exit code.
    const message =
      error instanceof MatchingConfigurationError
        ? `${error.reasonCode}: ${error.message}`
        : String(error);

    return {
      ok: false,
      setupVersionId: null,
      fallbackProgrammeKey: null,
      checked: [],
      missing: [],
      errors: [message],
    };
  }

  const checked = reachableProgrammeKeys(setup);
  const missing: string[] = [];

  for (const key of checked) {
    if (!(await content.findProgramme(key))) {
      missing.push(key);
    }
  }

  const fallback = setup.rules.find((rule) => rule.fallback);

  return {
    ok: missing.length === 0,
    setupVersionId: setup.setupVersionId,
    fallbackProgrammeKey: fallback?.programmeKey ?? null,
    checked,
    missing,
    errors: [],
  };
}

async function main(): Promise<void> {
  await dataSource.initialize();

  try {
    const report = await verifyPublishedMatching(
      new ProgrammeMatchingRepository(dataSource),
      new ProgrammeContentRepository(dataSource),
    );

    console.log(`active setup version: ${report.setupVersionId ?? "none"}`);
    console.log(`fallback programme:   ${report.fallbackProgrammeKey ?? "none"}`);

    for (const key of report.checked) {
      const published = !report.missing.includes(key);
      console.log(`  ${published ? "published" : "MISSING  "}  ${key}`);
    }

    for (const error of report.errors) {
      console.error(`\n${error}`);
    }

    if (!report.ok) {
      if (report.missing.length > 0) {
        console.error(
          `\n${report.missing.length} targeted programme(s) are not published: ${report.missing.join(", ")}`,
        );
      }

      process.exitCode = 1;
      return;
    }

    console.log("\nEvery programme the active setup can assign is published.");
  } finally {
    await dataSource.destroy();
  }
}

// Only self-executes when run as a script, so the test can import the pure
// verification function without opening a database connection.
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
