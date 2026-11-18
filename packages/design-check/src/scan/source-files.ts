import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "coverage",
  ".git",
]);

const EXTENSIONS = new Set([".ts", ".tsx"]);

/** Every TypeScript source file under a root, depth-first, in stable order. */
export function findSourceFiles(root: string): string[] {
  const out: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (EXTENSIONS.has(path.extname(entry))) {
        // Test files describe behaviour rather than render UI.
        if (!/\.test\.tsx?$/.test(entry)) out.push(full);
      }
    }
  };

  walk(root);
  return out;
}
