import { ConsoleLogger, type LogLevel } from "@nestjs/common";
import { scrubUnknown } from "./scrub-secrets";

/**
 * The application logger, with every argument scrubbed of token-shaped text on
 * the way out.
 *
 * Installed process-wide in main.ts rather than injected, because the guarantee
 * only means something if it holds for log calls nobody audited — including the
 * ones Nest itself makes, and the ones in code that does not exist yet.
 *
 * It extends ConsoleLogger rather than reimplementing LoggerService so the
 * formatting, colouring and context handling stay Nest's; the only behaviour
 * added is the scrub.
 */
export class ScrubbingLogger extends ConsoleLogger {
  protected printMessages(
    messages: unknown[],
    context?: string,
    logLevel?: LogLevel,
    writeStreamType?: "stdout" | "stderr",
  ): void {
    // One override covers log/warn/error/debug/verbose/fatal: every level
    // funnels through here before anything is written. Overriding the five
    // public methods instead would leave whichever one Nest adds next unscrubbed.
    super.printMessages(
      messages.map(scrubUnknown),
      context,
      logLevel,
      writeStreamType,
    );
  }

  protected printStackTrace(stack: string): void {
    if (!stack) {
      return;
    }

    super.printStackTrace(scrubUnknown(stack) as string);
  }
}
