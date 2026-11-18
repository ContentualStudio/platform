import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { AUDIT_SCRIPT, type PageAudit } from "./checks.js";
import { allScreens, THEMES, VIEWPORTS } from "./screens.js";

const VISUAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(VISUAL_DIR, ".auth");
const OUTPUT_DIR = path.resolve(VISUAL_DIR, "../../../output/design-check");
const SHOTS_DIR = path.join(OUTPUT_DIR, "screenshots");

/** Everything the report needs, accumulated across the run. */
interface ScreenRecord {
  screen: string;
  screenName: string;
  path: string;
  viewport: string;
  theme: "light" | "dark";
  screenshot: string;
  audit: PageAudit;
}

const records: ScreenRecord[] = [];

/**
 * The app's theme preference key. Duplicated from web/src/lib/theme.ts because
 * Playwright's loader cannot import TypeScript across workspaces; the test in
 * tests/screens.test.ts asserts the two still agree.
 */
const THEME_STORAGE_KEY = "theme";

/** Crops per screen. Anything beyond this is counted and reported, not dropped. */
const CROP_LIMIT = 12;

/**
 * A cut-out of the offending element plus context, as a data: URI.
 *
 * Embedding these rather than the full screenshots is what keeps the report a
 * single openable file: 152 full-page images at 2× would base64 to something
 * near 100MB, which browsers handle badly and email not at all.
 */
async function cropAround(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
  size: { w: number; h: number },
): Promise<string | undefined> {
  const pad = 40;

  const clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: Math.min(box.width + pad * 2, size.w),
    height: Math.min(box.height + pad * 2, 400),
  };
  if (clip.width < 1 || clip.height < 1) return undefined;
  clip.width = Math.min(clip.width, size.w - clip.x);
  clip.height = Math.min(clip.height, size.h - clip.y);
  if (clip.width < 1 || clip.height < 1) return undefined;

  const buffer = await page
    .screenshot({ clip, type: "jpeg", quality: 72 })
    .catch(() => null);
  return buffer ? `data:image/jpeg;base64,${buffer.toString("base64")}` : undefined;
}

/**
 * Stabilisation.
 *
 * This is an analysis pass, not golden-image regression testing — there is no
 * baseline to diff against, so pixel determinism is not required and most of
 * the usual burden disappears. What remains is the set of things that would
 * make the *findings* wrong rather than merely make the image differ.
 */
const FREEZE_MOTION = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
  /* The five keyframes in globals.css, plus the component-level entrance. */
  .auth-screen-enter { animation: none !important; }
  /* NextTopLoader renders as #nprogress and toggles this class on <html>. */
  #nprogress { display: none !important; }
  html.nprogress-busy { overflow: visible !important; }
  * { caret-color: transparent !important; }
`;

async function prepare(page: Page, theme: "light" | "dark"): Promise<void> {
  // Set the theme through the app's own mechanism so the pre-paint script
  // applies it before first paint — no flash, and it exercises the real code
  // path rather than forcing the attribute afterwards.
  //
  // The try/catch is load-bearing, not defensive noise: init scripts also run
  // on about:blank, where touching localStorage throws a SecurityError. An
  // uncaught throw there aborts the script, the preference is never written,
  // and every "dark" run silently renders light — which is exactly the kind of
  // failure that makes a report confidently wrong.
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key as string, value as string);
      } catch {
        /* about:blank has no accessible storage; the real origin will. */
      }
    },
    [THEME_STORAGE_KEY, theme],
  );

  // localStorage alone is not enough. PersistedThemeSync pushes the profile's
  // saved preference back into the store after hydration, and the seeded
  // profiles use the default, "system" — which resolves through
  // prefers-color-scheme. Emulating the OS preference is therefore what
  // actually decides the theme here, and it exercises the same path a real
  // user on a dark laptop takes.
  await page.emulateMedia({ colorScheme: theme });
}

async function settle(page: Page): Promise<void> {
  // Several screens redirect on arrival — the stage gate sends a persona to
  // wherever it should actually be, and the sign-in page bounces too. Injecting
  // anything into a document that is about to be replaced throws "execution
  // context was destroyed", so wait for the URL to stop moving first.
  // Seeded with the current URL so a screen that does not redirect — most of
  // them — costs one comparison and no sleep at all.
  let previous = page.url();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await page.waitForLoadState("load").catch(() => undefined);
    const current = page.url();
    if (current === previous) break;
    previous = current;
    await page.waitForTimeout(250);
  }

  // Wait on a real signal rather than a timeout. Every protected route streams
  // behind Suspense, and the skeletons carry a data attribute for exactly this.
  await page
    .waitForFunction(() => document.querySelectorAll("[data-skeleton]").length === 0, null, {
      timeout: 30_000,
    })
    .catch(() => undefined);

  await page.evaluate(() => document.fonts.ready).catch(() => undefined);

  // Still retried: a late client-side navigation can land between the check
  // above and this call.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.addStyleTag({ content: FREEZE_MOTION });
      break;
    } catch {
      await page.waitForTimeout(300);
    }
  }

  // Recharts animates on mount and has no global switch; a short settle is
  // cheaper and more reliable than reaching into each chart component.
  await page.waitForTimeout(400);
}

/*
 * Nested describes, one per persona, because `test.use` applies to the whole
 * enclosing scope rather than to the next test. Calling it inside the screen
 * loop would leave every test in the viewport running as whichever persona
 * happened to be last, and the gated screens would all silently redirect.
 */
const PERSONA_KEYS = [...new Set(allScreens().map((s) => s.persona))];

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.width}px)`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const persona of PERSONA_KEYS) {
      test.describe(`as ${persona}`, () => {
        test.use({ storageState: path.join(AUTH_DIR, `${persona}.json`) });

        for (const screen of allScreens().filter((s) => s.persona === persona)) {
          for (const theme of THEMES) {
        test(`${screen.name} — ${theme}`, async ({ page }) => {
          await prepare(page, theme);
          await page.goto(screen.path, { waitUntil: "domcontentloaded" });
          await settle(page);

          // A stage gate silently redirecting this persona would otherwise
          // produce a confident report about the wrong screen.
          expect(
            new URL(page.url()).pathname,
            `${screen.name} redirected away from ${screen.path}; the persona ` +
              `"${screen.persona}" cannot reach it`,
          ).toBe(screen.path);

          // Assert the theme actually took. Without this, a broken theme setup
          // produces a full run of duplicate screenshots and a parity check
          // that compares light against light and reports no problems.
          expect(
            await page.evaluate(() => document.documentElement.dataset.theme),
            `the ${theme} theme was not applied`,
          ).toBe(theme);

          const audit = (await page.evaluate(AUDIT_SCRIPT)) as PageAudit;

          // If the local fonts did not load, every typography finding below is
          // measured against a fallback family and is worthless. Fail the
          // screen rather than record it.
          expect(
            audit.fontsLoaded,
            `the page's own font ("${audit.fontFamily}") did not load, so every ` +
              `typography finding on this screen would be measured against a fallback`,
          ).toBe(true);

          mkdirSync(SHOTS_DIR, { recursive: true });
          const file = `${screen.id}--${viewport.name}--${theme}.png`;
          await page.screenshot({ path: path.join(SHOTS_DIR, file), fullPage: true });

          // Crops are what make the report readable without opening the app,
          // so they are generated at the design canvas width only — at four
          // viewports they would dominate both runtime and file size.
          if (viewport.name === "desktop") {
            const withBoxes = audit.findings.filter((f) => f.box && f.box.width > 0);
            const cropped = withBoxes.slice(0, CROP_LIMIT);
            // Measured once: the page does not change between crops.
            const size = await page.evaluate(() => ({
              w: document.documentElement.scrollWidth,
              h: document.documentElement.scrollHeight,
            }));
            for (const finding of cropped) {
              finding.cropDataUri = await cropAround(page, finding.box!, size);
            }
            if (withBoxes.length > cropped.length) {
              // Never let a cap pass silently: a truncated report reads as a
              // complete one.
              audit.cropsOmitted = withBoxes.length - cropped.length;
            }
          }

          records.push({
            screen: screen.id,
            screenName: screen.name,
            path: screen.path,
            viewport: viewport.name,
            theme,
            screenshot: `screenshots/${file}`,
            audit,
          });
        });
          }
        }
      });
    }
  });
}

test.afterAll(() => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const result = crossScreenChecks(records);

  /*
   * The per-element geometry map exists only for the theme-parity comparison
   * above, and it is by far the largest thing in memory — writing it out means
   * megabytes of JSON that design:report parses and then discards, because
   * VisualRecord has no geometry field.
   */
  const slim = {
    ...result,
    records: result.records.map(({ audit: { geometry: _geometry, ...audit }, ...rest }) => ({
      ...rest,
      audit,
    })),
  };

  writeFileSync(path.join(OUTPUT_DIR, "visual-records.json"), `${JSON.stringify(slim)}\n`);
});

/**
 * The checks that need more than one screen, and therefore cannot run inside
 * the page.
 */
export function crossScreenChecks(all: ScreenRecord[]): {
  records: ScreenRecord[];
  crossScreen: Array<{
    rule: string;
    ruleTitle: string;
    message: string;
    offending: string;
    expected?: string;
    screen?: string;
  }>;
} {
  const crossScreen: ReturnType<typeof crossScreenChecks>["crossScreen"] = [];

  /* --- same-role headers must match across pages --------------------- */
  const desktopLight = all.filter((r) => r.viewport === "desktop" && r.theme === "light");
  const titles = desktopLight.filter((r) => r.audit.pageTitle);

  const groups = new Map<string, string[]>();
  for (const record of titles) {
    const style = record.audit.pageTitle!;
    const key = `${style.fontSize}/${style.fontWeight}/${style.lineHeight}/${style.letterSpacing}`;
    groups.set(key, [...(groups.get(key) ?? []), record.screenName]);
  }

  if (groups.size > 1) {
    const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    const [dominantKey, dominantScreens] = sorted[0]!;
    const [dominantSize, dominantWeight] = dominantKey.split("/");

    for (const [key, screens] of sorted.slice(1)) {
      const [size, weight] = key.split("/");
      crossScreen.push({
        rule: "header-consistency",
        ruleTitle: "The same heading looks different on different screens",
        message:
          `The main heading is ${size} at weight ${weight} on ${screens.join(", ")}, but ` +
          `${dominantSize} at weight ${dominantWeight} on ${dominantScreens.length} other ` +
          `screens including ${dominantScreens.slice(0, 3).join(", ")}. The same thing ` +
          `should look the same everywhere — pick one and use it.`,
        offending: `${size} / ${weight}`,
        expected: `${dominantSize} / ${dominantWeight}`,
        screen: screens.join(", "),
      });
    }
  }

  /* --- light and dark must not change layout -------------------------- */
  for (const viewport of VIEWPORTS) {
    const byScreen = new Map<string, Partial<Record<"light" | "dark", ScreenRecord>>>();
    for (const record of all.filter((r) => r.viewport === viewport.name)) {
      const entry = byScreen.get(record.screen) ?? {};
      entry[record.theme] = record;
      byScreen.set(record.screen, entry);
    }

    for (const [, pair] of byScreen) {
      const { light, dark } = pair as { light?: ScreenRecord; dark?: ScreenRecord };
      if (!light || !dark) continue;

      let shifted = 0;
      let example = "";
      for (const [selector, box] of Object.entries(light.audit.geometry)) {
        const other = dark.audit.geometry[selector];
        if (!other) continue;
        const moved = box.some((value, i) => Math.abs(value - other[i]!) > 1);
        if (!moved) continue;
        shifted += 1;
        if (!example) example = selector;
      }

      if (shifted > 0) {
        crossScreen.push({
          rule: "theme-parity",
          ruleTitle: "Switching to dark mode moves things around",
          message:
            `${shifted} element(s) on this screen are in a different place in dark mode ` +
            `than in light mode, starting with ${example}. Changing the colours should ` +
            `never change the layout — if it does, something is sized by its colour.`,
          offending: `${shifted} element(s) move`,
          expected: "identical layout in both themes",
          screen: `${light.screenName} (${viewport.name})`,
        });
      }
    }
  }

  /* --- colours on screen that are not in the palette ------------------
     A second, runtime-side net. It sees colours the static pass cannot:
     third-party components, Recharts series, inline SVG fills. */
  const offPalette = new Map<string, Set<string>>();
  for (const record of all) {
    for (const colour of record.audit.offPaletteColours) {
      offPalette.set(colour, (offPalette.get(colour) ?? new Set()).add(record.screenName));
    }
  }
  for (const [colour, screens] of offPalette) {
    crossScreen.push({
      rule: "off-palette",
      ruleTitle: "A colour on screen is not in the design system",
      message:
        `${colour} appears on ${[...screens].slice(0, 4).join(", ")} but is not one of the ` +
        `design system's colours. It may be coming from a third-party component rather ` +
        `than from our own styles.`,
      offending: colour,
      screen: [...screens].join(", "),
    });
  }

  return { records: all, crossScreen };
}
