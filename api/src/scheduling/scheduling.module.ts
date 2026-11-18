import {
  Module,
  type DynamicModule,
  type FactoryProvider,
  type ModuleMetadata,
} from "@nestjs/common";
import { DailyLocalSweepService } from "./daily-local-sweep.service";
import { DailyLocalSweepWorker } from "./daily-local-sweep.worker";
import { SWEEP_JOBS, type SweepJob } from "./sweep-job.port";

/**
 * The generic per-user daily scheduler.
 *
 * Nothing here knows about Instagram. Jobs are contributed by the feature
 * modules that own them, through `forRoot`, so the 7am notification can join
 * without either feature learning about the other or a second scheduler being
 * written.
 */
@Module({})
export class SchedulingModule {
  static forRoot(jobs: {
    imports?: ModuleMetadata["imports"];
    inject: NonNullable<FactoryProvider<SweepJob[]>["inject"]>;
  }): DynamicModule {
    return {
      module: SchedulingModule,
      imports: jobs.imports ?? [],
      providers: [
        {
          provide: SWEEP_JOBS,
          inject: jobs.inject,
          useFactory: (...registered: SweepJob[]) => registered,
        },
        DailyLocalSweepService,
        DailyLocalSweepWorker,
      ],
      exports: [DailyLocalSweepService],
    };
  }
}
