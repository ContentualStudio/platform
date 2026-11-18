import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DailyLocalSweepService } from "./daily-local-sweep.service";

/**
 * Drives the daily sweep.
 *
 * Hand-rolled rather than `@nestjs/schedule`, for the same reason
 * `RuleBackfillWorker` is: a poll loop is the entire requirement, and a
 * dependency whose only user is one timer is not worth the supply chain. This
 * follows that file closely on purpose — it is the pattern this codebase has
 * already proven, and a second, subtly different worker would be a worse thing
 * to own than a familiar one.
 *
 * The loop reschedules from the *end* of each tick, so a slow sweep cannot
 * stack ticks on top of each other.
 *
 * Off by default. It makes outbound calls to Meta on a timer, which is not
 * something a developer should get merely by running the app.
 */
@Injectable()
export class DailyLocalSweepWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(DailyLocalSweepWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private tick: Promise<void> | null = null;
  private stopped = false;

  constructor(
    private readonly config: ConfigService,
    private readonly sweep: DailyLocalSweepService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get<boolean>("scheduling.enabled")) {
      this.logger.log("Daily sweep disabled; per-user daily work will not run");
      return;
    }

    this.schedule(0);
  }

  /**
   * Stops scheduling and waits for the tick in flight.
   *
   * Waiting matters: a tick killed mid-run leaves a row claimed under a lease
   * nobody is working, and the next worker has to wait the lease out before it
   * can be taken over.
   */
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

    // Never hold the process open on this timer's account: a script that boots
    // the application context should exit when its work is done.
    this.timer.unref?.();
  }

  private async runOnce(): Promise<void> {
    try {
      const summaries = await this.sweep.tick(this.localHour());

      for (const summary of summaries) {
        if (summary.claimed > 0) {
          this.logger.log(
            `Sweep ${summary.jobName}: claimed=${summary.claimed} ` +
              `succeeded=${summary.succeeded} skipped=${summary.skipped} ` +
              `failed=${summary.failed}`,
          );
        }
      }
    } catch (error) {
      // The service already isolates per-user failures; anything reaching here
      // is the sweep itself. Rethrowing would take the api down over it.
      this.logger.error(
        `Daily sweep tick failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private pollMs(): number {
    return this.config.get<number>("scheduling.pollMs") ?? 60_000;
  }

  private localHour(): number {
    return this.config.get<number>("scheduling.localHour") ?? 7;
  }
}
