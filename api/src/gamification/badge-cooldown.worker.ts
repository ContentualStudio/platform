import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { scrubbedMessage } from "../observability/scrub-secrets";
import { BadgeCooldownProcessor } from "./badge-cooldown.processor";

/**
 * Drives the badge cooldown processor.
 *
 * A poll rather than a `SweepJob`: the sweep runs once a day at the user's
 * local 7am, whereas a badge should be released within a poll of its user's
 * 24-hour window reopening. Same hand-rolled loop as `DailyLocalSweepWorker`,
 * for the same reasons — it reschedules from the end of each tick, so a slow
 * pass cannot stack ticks.
 */
@Injectable()
export class BadgeCooldownWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(BadgeCooldownWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private tick: Promise<void> | null = null;
  private stopped = false;

  constructor(
    private readonly config: ConfigService,
    private readonly processor: BadgeCooldownProcessor,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get<boolean>("gamification.badgeCooldown.enabled")) {
      this.logger.log(
        "Badge cooldown worker disabled; queued badges will not be released",
      );
      return;
    }

    this.schedule(0);
  }

  /** Stops scheduling and waits for the tick in flight to commit. */
  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    await this.tick;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) {
      return;
    }

    this.timer = setTimeout(() => {
      this.tick = this.runOnce();
      void this.tick.finally(() => {
        this.tick = null;
        this.schedule(this.pollMs());
      });
    }, delayMs);

    this.timer.unref?.();
  }

  private async runOnce(): Promise<void> {
    try {
      const summary = await this.processor.processDue();

      if (summary.released + summary.suppressed + summary.failed > 0) {
        this.logger.log(
          `Badge cooldown: released=${summary.released} ` +
            `suppressed=${summary.suppressed} failed=${summary.failed}`,
        );
      }
    } catch (error) {
      // The processor isolates per-user failures; anything here is the
      // candidate query itself. Rethrowing would take the api down over it.
      this.logger.error(`Badge cooldown tick failed: ${scrubbedMessage(error)}`);
    }
  }

  private pollMs(): number {
    return this.config.get<number>("gamification.badgeCooldown.pollMs") ?? 60_000;
  }
}
