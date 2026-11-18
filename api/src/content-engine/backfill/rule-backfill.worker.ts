import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RuleBackfillService } from "./rule-backfill.service";

/**
 * Consumes the backfill queue automatically.
 *
 * Without this the admin endpoint enqueues work that nothing picks up: a
 * rollout triggered from the engine view would sit `queued` until somebody
 * remembered to run a script, which is not a background job — it is a to-do
 * item with extra steps.
 *
 * Hand-rolled rather than `@nestjs/schedule`, because a poll loop is the whole
 * requirement and a dependency whose only user is one timer is not worth the
 * supply chain. The loop reschedules from the *end* of each tick rather than on
 * a fixed interval, so a slow claim can never stack ticks on top of each other.
 *
 * Safe on more than one replica. Claiming uses `FOR UPDATE SKIP LOCKED` and a
 * fenced lease, so a second instance takes a different run rather than
 * duplicating this one — the same property that lets a crashed worker's run be
 * taken over.
 */
@Injectable()
export class RuleBackfillWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RuleBackfillWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private tick: Promise<void> | null = null;
  private stopped = false;

  constructor(
    private readonly config: ConfigService,
    private readonly backfills: RuleBackfillService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get<boolean>("contentEngineBackfill.worker.enabled")) {
      this.logger.log("Backfill worker disabled; queued runs will not start");
      return;
    }

    this.schedule(0);
  }

  /**
   * Stops scheduling and waits for the tick in flight.
   *
   * Waiting matters: a tick killed mid-page would leave the run holding a lease
   * nobody is working, and the next worker would have to wait it out. Letting
   * the claim finish means the run either completes or is left with its cursor
   * saved at a page boundary.
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
        // A tick that did work reschedules immediately, so a queue with a
        // backlog drains at the pace of the scan's own pauses rather than at
        // the poll interval. An idle tick waits.
        this.schedule(this.lastTickDidWork ? 0 : this.pollMs());
      });
    }, delayMs);

    // Never hold the process open on this timer's account. A script that boots
    // the application context and finishes its work should exit, not linger
    // until the next poll.
    this.timer.unref?.();
  }

  private lastTickDidWork = false;

  private async runOnce(): Promise<void> {
    try {
      // One run per tick. `processQueued` would happily drain the whole queue
      // in a single call, but returning to the scheduler between runs is what
      // lets a shutdown land promptly.
      const summaries = await this.backfills.processQueued(1);
      this.lastTickDidWork = summaries.length > 0;

      for (const summary of summaries) {
        this.logger.log(
          `Backfill run ${summary.runId} for rule ${summary.ruleId}: ` +
            `users inScope=${summary.usersInScope} fired=${summary.usersFired} ` +
            `skipped=${summary.usersSkipped} failed=${summary.usersFailed} ` +
            `(${summary.stoppedBecause})`,
        );
      }
    } catch (error) {
      // A failed run has already been recorded against its row. Rethrowing here
      // would take the API process down over one bad rollout.
      this.lastTickDidWork = false;
      this.logger.error(
        `Backfill worker tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private pollMs(): number {
    return (
      this.config.get<number>("contentEngineBackfill.worker.pollMs") ?? 30_000
    );
  }
}
