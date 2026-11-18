import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import {
  BackfillRefusedError,
  RuleBackfillService,
  type RuleBackfillOptions,
} from "../backfill/rule-backfill.service";
import {
  RuleBackfillRunRepository,
  type BackfillRunRow,
} from "../backfill/rule-backfill-run.repository";
import { ContentEngineAdminGuard } from "./content-engine-admin.guard";

interface EnqueueBackfillBody {
  ruleId?: unknown;
  pageSize?: unknown;
  pauseMs?: unknown;
  maxCandidates?: unknown;
  dryRun?: unknown;
  requestedBy?: unknown;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException({
      code: "INVALID_REQUEST",
      message: `${field} is required.`,
    });
  }

  return value.trim();
}

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new BadRequestException({
      code: "INVALID_REQUEST",
      message: `${field} must be a non-negative integer.`,
    });
  }

  return value as number;
}

// The run row is the API's response shape minus its lease bookkeeping. The
// lease token is a fencing credential — publishing it would let a caller write
// progress into somebody else's run.
function present(run: BackfillRunRow) {
  return {
    id: run.id,
    ruleId: run.ruleId,
    status: run.status,
    requestedBy: run.requestedBy,
    dryRun: run.dryRun,
    users: {
      inScope: run.usersInScope,
      fired: run.usersFired,
      skipped: run.usersSkipped,
      failed: run.usersFailed,
    },
    candidates: {
      scanned: run.candidatesScanned,
      fired: run.candidatesFired,
      skipped: run.candidatesSkipped,
      failed: run.candidatesFailed,
    },
    skippedReasons: run.skippedReasons,
    failures: run.failures,
    stoppedBecause: run.stoppedBecause,
    refusal: run.refusal,
    lastError: run.lastError,
    // Present while a limited run has more to do; the next run resumes here
    // rather than rescanning from the start.
    hasMore: run.cursor !== null,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  };
}

/**
 * The operator surface the admin engine view drives.
 *
 * Enqueue returns 202 and a run id, never the finished result. A backfill can
 * take longer than any sensible HTTP timeout, and a request that held the
 * connection open for it would tie the rollout's survival to the browser tab
 * that started it. Progress is polled through the run id instead.
 */
@Controller("admin/content-engine/backfills")
@UseGuards(ContentEngineAdminGuard)
export class ContentEngineAdminController {
  constructor(
    private readonly backfills: RuleBackfillService,
    private readonly runs: RuleBackfillRunRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async enqueue(@Body() body: EnqueueBackfillBody) {
    const options: RuleBackfillOptions = {
      pageSize: optionalInteger(body.pageSize, "pageSize"),
      pauseMs: optionalInteger(body.pauseMs, "pauseMs"),
      maxCandidates: optionalInteger(body.maxCandidates, "maxCandidates"),
      dryRun: body.dryRun === true,
      requestedBy:
        typeof body.requestedBy === "string" ? body.requestedBy.trim() : null,
    };

    try {
      const run = await this.backfills.enqueue(
        requiredText(body.ruleId, "ruleId"),
        options,
      );

      return present(run);
    } catch (error) {
      // A refusal is a well-formed request the engine will not carry out — 422
      // rather than 400, and it carries the reason so the admin view can say
      // "activate the rule first" instead of "something went wrong".
      if (error instanceof BackfillRefusedError) {
        throw new UnprocessableEntityException({
          code: "BACKFILL_REFUSED",
          reason: error.refusal.reason,
          message: error.message,
        });
      }

      throw error;
    }
  }

  @Get()
  async list(@Query("ruleId") ruleId?: string) {
    const runs = await this.runs.listRecent(ruleId?.trim() || undefined);

    return runs.map(present);
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const run = await this.runs.findById(id);

    if (!run) {
      throw new NotFoundException({
        code: "BACKFILL_RUN_NOT_FOUND",
        message: `No backfill run ${id}.`,
      });
    }

    return present(run);
  }
}
