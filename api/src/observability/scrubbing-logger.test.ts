import * as assert from "node:assert/strict";
import { test } from "node:test";
import { REDACTED } from "./redact";
import { ScrubbingLogger } from "./scrubbing-logger";

const token = "IGQVJYaGxsdGVzdHRva2VuZm9yc2NydWJiaW5n";

// The logger writes through process.stdout/stderr. Capturing them is the only
// honest assertion available: anything short of the bytes that actually leave
// the process would be testing the intention rather than the guarantee.
function captureOutput(run: (logger: ScrubbingLogger) => void): string {
  const chunks: string[] = [];
  const streams = [process.stdout, process.stderr] as const;
  const originals = streams.map((stream) => stream.write);

  for (const stream of streams) {
    stream.write = ((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof stream.write;
  }

  try {
    run(new ScrubbingLogger("Test", { timestamp: false }));
  } finally {
    streams.forEach((stream, index) => {
      stream.write = originals[index] as typeof stream.write;
    });
  }

  return chunks.join("");
}

test("a token in a log message never reaches the output stream", () => {
  const output = captureOutput((logger) =>
    logger.log(`refreshing with ${token}`),
  );

  assert.ok(!output.includes(token));
  assert.ok(output.includes(REDACTED));
});

test("every level is covered, not just log", () => {
  for (const level of ["warn", "error", "debug", "verbose"] as const) {
    const output = captureOutput((logger) => {
      // debug/verbose are off at the default level; raise it so each level
      // genuinely writes rather than passing by not being printed at all.
      logger.setLogLevels(["log", "warn", "error", "debug", "verbose"]);
      logger[level](`level ${level} carrying ${token}`);
    });

    assert.ok(!output.includes(token), `${level} leaked the token`);
  }
});

test("a token inside an error stack is scrubbed", () => {
  const error = new Error(`exchange failed for ${token}`);

  const output = captureOutput((logger) => logger.error(error.message, error.stack));

  assert.ok(!output.includes(token));
});

test("an ordinary log line is written unchanged", () => {
  const output = captureOutput((logger) => logger.log("Backfill run 12 finished"));

  assert.ok(output.includes("Backfill run 12 finished"));
  assert.ok(!output.includes(REDACTED));
});
