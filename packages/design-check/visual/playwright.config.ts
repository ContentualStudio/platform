import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

const VISUAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(VISUAL_DIR, "../../..");

/**
 * Chromium only, on purpose. Cross-browser rendering differences are a
 * different problem from design conformance, and adding WebKit would triple
 * the runtime to produce findings nobody would act on.
 *
 * Viewports are not evenly spaced — they are chosen against Tailwind's
 * breakpoints. 390 is the narrowest realistic device (below `sm`), 768 sits
 * exactly on `md` where off-by-one breakpoint bugs live, 1280 is exactly `xl`,
 * and 1440 is the design canvas.
 */
export default defineConfig({
  testDir: VISUAL_DIR,
  testMatch: /audit\.spec\.ts$/,
  globalSetup: path.join(VISUAL_DIR, "global-setup.ts"),
  // One spec file plus fullyParallel:false means Playwright shards at file
  // granularity, so every test lands in one worker regardless. Asking for more
  // would advertise parallelism the run cannot use; making it real needs each
  // test to write its own shard for a globalTeardown to merge.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [["list"], ["json", { outputFile: path.join(REPO_ROOT, "output/design-check/visual.json") }]],
  outputDir: path.join(REPO_ROOT, "output/design-check/.playwright"),
  webServer: {
    command: "yarn workspace @contentual/web dev",
    url: "http://localhost:3000/api/health",
    cwd: REPO_ROOT,
    reuseExistingServer: true,
    timeout: 180_000,
  },
  use: {
    baseURL: process.env.DESIGN_CHECK_BASE_URL ?? "http://localhost:3000",
    // Belt and braces with the stylesheet the spec injects: this asks the
    // browser to honour prefers-reduced-motion, that one stops the animations
    // the app defines itself.
    contextOptions: { reducedMotion: "reduce" },
    // Screenshots are reviewed by eye at 2×; the sharpness check measures
    // against this too.
    deviceScaleFactor: 2,
  },
});
