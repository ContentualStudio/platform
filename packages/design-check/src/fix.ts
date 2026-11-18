import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Finding } from "./report/findings.js";

/**
 * Applies the fixes the check itself proposes.
 *
 * Only findings carrying an explicit `fix` are applied — anything needing a
 * judgement call (a colour with no near token, a skipped heading level, a
 * utility pointing at a token that no longer exists) is left for a person.
 * Replacements are made back-to-front within each file so earlier offsets stay
 * valid as the text shifts.
 */

export interface FixResult {
  filesChanged: number;
  replacements: number;
  skipped: number;
}

export function applyFixes(findings: Finding[], repoRoot: string): FixResult {
  const byFile = new Map<string, Finding[]>();
  let skipped = 0;

  for (const finding of findings) {
    if (!finding.fix || !finding.file || !finding.line || !finding.column) {
      if (finding.severity === "error") skipped += 1;
      continue;
    }
    byFile.set(finding.file, [...(byFile.get(finding.file) ?? []), finding]);
  }

  let filesChanged = 0;
  let replacements = 0;

  for (const [file, fileFindings] of byFile) {
    const absolute = path.join(repoRoot, file);
    const source = readFileSync(absolute, "utf8");
    const lines = source.split("\n");

    // Back-to-front so that an earlier finding's column is still correct after
    // a later one on the same line has been rewritten.
    const ordered = [...fileFindings].sort(
      (a, b) => (b.line ?? 0) - (a.line ?? 0) || (b.column ?? 0) - (a.column ?? 0),
    );

    let changed = false;
    for (const finding of ordered) {
      const index = (finding.line ?? 1) - 1;
      const line = lines[index];
      if (line === undefined) continue;

      const start = (finding.column ?? 1) - 1;
      // Verify before writing: if the text at the recorded position is not
      // what was reported, the file has moved underneath us and guessing
      // would corrupt it.
      if (!line.startsWith(finding.offending, start)) {
        skipped += 1;
        continue;
      }

      lines[index] =
        line.slice(0, start) + finding.fix + line.slice(start + finding.offending.length);
      changed = true;
      replacements += 1;
    }

    if (changed) {
      writeFileSync(absolute, lines.join("\n"));
      filesChanged += 1;
    }
  }

  return { filesChanged, replacements, skipped };
}
