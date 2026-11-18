import type { Finding, RunResult } from "./findings.js";

/**
 * The designer-facing report.
 *
 * Design does not use a command line, so this is the actual deliverable of the
 * whole exercise: a single file that opens by double-click, needs no tooling,
 * no network and no install, and says what is wrong in English rather than in
 * utility-class syntax.
 *
 * Full screenshots are referenced relatively; crops are embedded as data URIs.
 * That split is deliberate — 152 full-page images at 2× would base64 to
 * roughly 100MB, which is slow in Chrome and rejected by most mail servers,
 * whereas embedding only the cut-outs keeps the file small enough to send
 * while still letting every finding be understood on its own.
 */

export interface VisualRecord {
  screen: string;
  screenName: string;
  path: string;
  viewport: string;
  theme: "light" | "dark";
  screenshot: string;
  audit: {
    findings: Array<{
      rule: string;
      ruleTitle: string;
      message: string;
      offending: string;
      expected?: string;
      selector: string;
      cropDataUri?: string;
    }>;
    cropsOmitted?: number;
  };
}

export interface VisualData {
  records: VisualRecord[];
  crossScreen: Array<{
    rule: string;
    ruleTitle: string;
    message: string;
    offending: string;
    expected?: string;
    screen?: string;
  }>;
}

const escape = (text: string): string =>
  text.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** Groups call-site findings by the offending value rather than by file.
 *
 * "13px text appears 44 times, use text-sm" is one decision a designer makes
 * once. Forty-four separate file-and-line entries is a wall of noise that
 * says the same thing.
 */
function groupByValue(findings: Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const key = `${finding.rule}::${finding.offending}`;
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  return new Map([...groups].sort((a, b) => b[1].length - a[1].length));
}

function findingBlock(
  title: string,
  message: string,
  offending: string,
  expected: string | undefined,
  extra = "",
): string {
  return `
    <div class="finding">
      <h4>${escape(title)}</h4>
      <p>${escape(message)}</p>
      <p class="values">
        <span class="was">${escape(offending)}</span>
        ${expected ? `<span class="arrow">→</span><span class="should">${escape(expected)}</span>` : ""}
      </p>
      ${extra}
    </div>`;
}

export function renderHtml(
  staticResult: RunResult,
  visual: VisualData | null,
  generatedAt: string,
): string {
  const system = staticResult.findings.filter((f) => f.rule.startsWith("S"));
  /*
   * Everything that is not a design-system finding and not a layout
   * measurement, at any severity. Filtering to `severity === "error"` here
   * silently dropped call-site warnings from the designer's copy while leaving
   * them in the console — the report has to show what the run found.
   */
  const layout = staticResult.findings.filter((f) => f.rule === "layout-size");
  const callSites = staticResult.findings.filter(
    (f) => !f.rule.startsWith("S") && f.rule !== "layout-size",
  );

  const visualFindingCount =
    (visual?.records.reduce((n, r) => n + r.audit.findings.length, 0) ?? 0) +
    (visual?.crossScreen.length ?? 0);

  /* --- 1. the design system itself ---------------------------------- */
  const systemSection = system.length
    ? system
        .map((f) => findingBlock(f.ruleTitle, f.message, f.offending, f.expected))
        .join("")
    : `<p class="clean">The design system is internally consistent — no duplicate colours,
        no values off the scales, nothing hardcoded that should be a token.</p>`;

  /* --- 2. screens ---------------------------------------------------- */
  let screensSection: string;
  if (!visual) {
    screensSection = `
      <p class="missing"><strong>The screen-by-screen review has not been run.</strong>
      This report covers the design system and the code only. To include the screens,
      run the visual check — it needs the app running locally. Nothing below is missing
      because it passed; it is missing because it was not looked at.</p>`;
  } else {
    const byScreen = new Map<string, VisualRecord[]>();
    for (const record of visual.records) {
      byScreen.set(record.screen, [...(byScreen.get(record.screen) ?? []), record]);
    }

    screensSection = [...byScreen.values()]
      .map((records) => {
        const first = records[0]!;
        const light = records.find((r) => r.viewport === "desktop" && r.theme === "light");
        const dark = records.find((r) => r.viewport === "desktop" && r.theme === "dark");

        /* Grouped by cause, not by element. A palette colour that fails
           contrast fails on every element that uses it — on this app that is
           one decision showing up 749 times. Listing each occurrence buries
           the eleven decisions that actually need making. */
        const byCause = new Map<
          string,
          { rule: string; ruleTitle: string; message: string; offending: string;
            expected?: string; count: number; where: Set<string>; cropDataUri?: string }
        >();

        for (const record of records) {
          for (const f of record.audit.findings) {
            const key = `${f.rule}::${f.offending}`;
            const entry = byCause.get(key) ?? {
              rule: f.rule, ruleTitle: f.ruleTitle, message: f.message,
              offending: f.offending, expected: f.expected,
              count: 0, where: new Set<string>(), cropDataUri: undefined,
            };
            entry.count += 1;
            entry.where.add(`${record.viewport}, ${record.theme}`);
            entry.cropDataUri ??= f.cropDataUri;
            byCause.set(key, entry);
          }
        }

        const findings = [...byCause.values()].sort((a, b) => b.count - a.count);

        const omitted = records.reduce((n, r) => n + (r.audit.cropsOmitted ?? 0), 0);

        return `
        <section class="screen">
          <h3>${escape(first.screenName)} <span class="path">${escape(first.path)}</span></h3>
          <div class="shots">
            ${light ? `<figure><img alt="${escape(first.screenName)} in light mode" loading="lazy" src="${escape(light.screenshot)}"><figcaption>Light</figcaption></figure>` : ""}
            ${dark ? `<figure><img alt="${escape(first.screenName)} in dark mode" loading="lazy" src="${escape(dark.screenshot)}"><figcaption>Dark</figcaption></figure>` : ""}
          </div>
          ${
            findings.length === 0
              ? `<p class="clean">Nothing found on this screen.</p>`
              : findings
                  .map((f) =>
                    findingBlock(
                      f.ruleTitle,
                      f.message,
                      f.offending,
                      f.expected,
                      `<p class="where">${f.count} place${f.count === 1 ? "" : "s"} on this screen — seen at ${escape([...f.where].join("; "))}</p>` +
                        (f.cropDataUri
                          ? `<img alt="" class="crop" loading="lazy" src="${f.cropDataUri}">`
                          : ""),
                    ),
                  )
                  .join("")
          }
          ${omitted ? `<p class="note">${omitted} further finding(s) on this screen have no picture attached, to keep this file a manageable size. They are listed above.</p>` : ""}
        </section>`;
      })
      .join("");

    if (visual.crossScreen.length) {
      screensSection =
        `<section class="screen across">
          <h3>Across the whole app</h3>
          ${visual.crossScreen
            .map((f) =>
              findingBlock(
                f.ruleTitle,
                f.message,
                f.offending,
                f.expected,
                f.screen ? `<p class="where">${escape(f.screen)}</p>` : "",
              ),
            )
            .join("")}
        </section>` + screensSection;
    }
  }

  /* --- 3. values not in the design system ---------------------------- */
  const grouped = groupByValue(callSites);
  const valuesSection = grouped.size
    ? [...grouped.entries()]
        .map(([, group]) => {
          const first = group[0]!;
          const locations = group
            .map((f) => `<li>${escape(f.file ?? "")}<span class="ln">:${f.line}</span></li>`)
            .join("");
          return `
          <details class="finding">
            <summary>
              <strong>${escape(first.offending)}</strong>
              appears ${group.length} time${group.length === 1 ? "" : "s"}
              ${first.expected ? `<span class="arrow">→</span><span class="should">${escape(first.expected)}</span>` : `<span class="unknown">no equivalent in the design system</span>`}
            </summary>
            <p>${escape(first.message)}</p>
            <ul class="locations">${locations}</ul>
          </details>`;
        })
        .join("")
    : `<p class="clean">Every colour, size, spacing and radius in the code comes from the
        design system.</p>`;

  /* --- 4. layout measurements ---------------------------------------- */
  const layoutGroups = groupByValue(layout);
  const layoutSection = layoutGroups.size
    ? `<p class="lede">These are container widths and heights rather than scale decisions,
        so they are not treated as mistakes. They are listed because each one is a number
        somebody chose, and it is worth confirming they were all chosen on purpose.</p>` +
      [...layoutGroups.entries()]
        .map(
          ([, group]) => `
          <details class="finding quiet">
            <summary><strong>${escape(group[0]!.offending)}</strong> — ${group.length} use${group.length === 1 ? "" : "s"}</summary>
            <ul class="locations">${group.map((f) => `<li>${escape(f.file ?? "")}<span class="ln">:${f.line}</span></li>`).join("")}</ul>
          </details>`,
        )
        .join("")
    : `<p class="clean">Nothing to confirm.</p>`;

  const counts = [
    `${system.length} in the design system`,
    `${callSites.length} in the code`,
    `${visualFindingCount} on screen`,
    `${visual ? new Set(visual.records.map((r) => r.screen)).size : 0} screens reviewed`,
  ].join(" · ");

  const caveats: string[] = [];
  if (staticResult.stats.unresolvableInterpolations > 0) {
    caveats.push(
      `${staticResult.stats.unresolvableInterpolations} style(s) in the code are assembled
       while the app runs, so they could not be checked.`,
    );
  }
  if (staticResult.stats.unanalysedColorNotations > 0) {
    caveats.push(
      `${staticResult.stats.unanalysedColorNotations} colour(s) are written in a format
       this check does not yet read.`,
    );
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta content="width=device-width, initial-scale=1" name="viewport">
<title>Contentual design check</title>
<style>
  :root {
    --bg: #ffffff; --fg: #111111; --muted: #555555; --line: #e0e0e0;
    --surface: #f7f7f7; --accent: #f95616; --bad: #c5221f; --good: #137333;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #121212; --fg: #f0f0f0; --muted: #aaaaaa; --line: #333333;
      --surface: #1e1e1e; --accent: #f95616; --bad: #ef5350; --good: #30d158;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg); line-height: 1.5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 16px;
  }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 48px 24px 96px; }
  header { border-bottom: 2px solid var(--fg); padding-bottom: 24px; margin-bottom: 48px; }
  h1 { font-size: 32px; margin: 0 0 8px; letter-spacing: -0.02em; }
  .meta { color: var(--muted); font-size: 15px; margin: 0; }
  h2 {
    font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--muted); margin: 64px 0 16px; font-weight: 700;
  }
  h2:first-of-type { margin-top: 0; }
  h3 { font-size: 22px; margin: 0 0 16px; letter-spacing: -0.01em; }
  h4 { font-size: 16px; margin: 0 0 6px; }
  .path { color: var(--muted); font-weight: 400; font-size: 15px; }
  .screen { border: 1px solid var(--line); border-radius: 14px; padding: 24px; margin-bottom: 24px; }
  .shots { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  @media (max-width: 720px) { .shots { grid-template-columns: 1fr; } }
  .shots figure { margin: 0; }
  .shots img { width: 100%; height: auto; border: 1px solid var(--line); border-radius: 8px; display: block; }
  figcaption { color: var(--muted); font-size: 13px; margin-top: 6px; }
  .finding {
    border-left: 3px solid var(--bad); padding: 12px 0 12px 16px; margin: 16px 0;
  }
  .finding.quiet { border-left-color: var(--line); }
  .finding p { margin: 0 0 8px; }
  .values { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; }
  .was { color: var(--bad); }
  .should { color: var(--good); }
  .arrow { color: var(--muted); margin: 0 8px; }
  .unknown { color: var(--muted); font-style: italic; }
  .where { color: var(--muted); font-size: 13px; }
  .crop { max-width: 100%; height: auto; border: 1px solid var(--line); border-radius: 6px; margin-top: 8px; }
  .clean { color: var(--good); }
  .missing { background: var(--surface); border-radius: 10px; padding: 16px; }
  .note, .lede { color: var(--muted); font-size: 14px; }
  details summary { cursor: pointer; padding: 6px 0; }
  .locations { margin: 8px 0 0; padding-left: 18px; font-family: ui-monospace, Menlo, monospace; font-size: 13px; color: var(--muted); max-height: 260px; overflow-y: auto; }
  .ln { color: var(--accent); }
  footer { margin-top: 64px; padding-top: 24px; border-top: 1px solid var(--line); color: var(--muted); font-size: 14px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Contentual — design check</h1>
    <p class="meta">${escape(generatedAt)} · ${escape(counts)}</p>
  </header>

  <h2>1 · The design system itself</h2>
  ${systemSection}

  <h2>2 · Screen by screen</h2>
  ${screensSection}

  <h2>3 · Values that are not in the design system</h2>
  <p class="lede">Grouped by the value rather than by file, because each one is a single
    decision. Open a row to see everywhere it is used.</p>
  ${valuesSection}

  <h2>4 · Layout measurements to confirm</h2>
  ${layoutSection}

  <footer>
    <p>Generated by <code>yarn design:report</code>. Full-size screenshots are in the
      <code>screenshots</code> folder next to this file; the close-ups are inside it.</p>
    ${caveats.length ? `<p><strong>Not covered:</strong> ${caveats.map(escape).join(" ")}</p>` : ""}
  </footer>
</div>
</body>
</html>
`;
}
