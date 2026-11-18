import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

import {
  dedupeScopes,
  effectTypes,
  eventNames,
  operators,
} from "../src/catalogue";

export interface SourceInput {
  readonly filePath: string;
  readonly sourceText: string;
}

export interface VocabularyLiteralViolation {
  readonly filePath: string;
  readonly line: number;
  readonly token: string;
}

const vocabularyTokens = new Set<string>([
  ...eventNames,
  ...operators,
  ...effectTypes,
  ...dedupeScopes,
]);

// Files whose contents are emitted from the Payload config — which builds its
// option lists from these very tuples. They restate tokens by construction, and
// a codegen run would reintroduce any hand-edit.
const generatedFiles = ["payload-types.ts"];

function isGenerated(filePath: string): boolean {
  return generatedFiles.some((name) => filePath.endsWith(name));
}

export function findVocabularyLiteralViolations(
  sources: readonly SourceInput[],
): VocabularyLiteralViolation[] {
  const violations: VocabularyLiteralViolation[] = [];

  for (const source of sources) {
    if (isGenerated(source.filePath)) {
      continue;
    }

    const sourceFile = ts.createSourceFile(
      source.filePath,
      source.sourceText,
      ts.ScriptTarget.Latest,
      true,
      source.filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const visit = (node: ts.Node): void => {
      if (
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        vocabularyTokens.has(node.text)
      ) {
        const location = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        violations.push({
          filePath: source.filePath,
          line: location.line + 1,
          token: node.text,
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return violations;
}

async function collectTypeScriptSources(directory: string): Promise<SourceInput[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const sources: SourceInput[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      sources.push(...(await collectTypeScriptSources(entryPath)));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      sources.push({
        filePath: entryPath,
        sourceText: await readFile(entryPath, "utf8"),
      });
    }
  }

  return sources;
}

export async function scanWorkspaceVocabularyOwnership(
  repositoryRoot: string,
): Promise<VocabularyLiteralViolation[]> {
  const workspaceSourceRoots = ["api/src", "cms/src", "web/src"];
  const sources = (
    await Promise.all(
      workspaceSourceRoots.map((sourceRoot) =>
        collectTypeScriptSources(path.join(repositoryRoot, sourceRoot)),
      ),
    )
  ).flat();

  return findVocabularyLiteralViolations(sources).map((violation) => ({
    ...violation,
    filePath: path.relative(repositoryRoot, violation.filePath),
  }));
}

async function main(): Promise<void> {
  const repositoryRoot = path.resolve(process.cwd(), "../..");
  const violations = await scanWorkspaceVocabularyOwnership(repositoryRoot);
  if (violations.length === 0) {
    return;
  }

  for (const violation of violations) {
    console.error(
      `${violation.filePath}:${violation.line}: import vocabulary token ${JSON.stringify(violation.token)} instead of redefining it`,
    );
  }
  process.exitCode = 1;
}

if (require.main === module) {
  void main();
}
