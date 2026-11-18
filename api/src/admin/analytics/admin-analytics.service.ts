import { Inject, Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import {
  PROGRAMME_CONTENT_READER,
  type ProgrammeContentReader,
} from "../../challenge-setup/programmes/programme-content.repository";
import { returnedRows } from "../../content-engine/returned-rows";
import { ledgerKeyFor } from "../../programme-enrolment/ledger-key";
import {
  COMPLETED_PROGRESS_COLUMNS,
  measureEnrolmentCompletion,
  type CompletedProgressRow,
  type CompletionEnrolment,
} from "../../programme-tasks/enrolment-completion";
import {
  buildProgrammeCompletionReport,
  type JourneyStatus,
  type ProgrammeCompletionReport,
  type ProgrammeIdentity,
} from "./programme-completion";

const PROGRAMMES_SQL = `SELECT "slug", "title" FROM "programme"`;

// Each user's most recent journey per programme; see programme-completion.ts
// for why that is the unit. id breaks a startedAt tie so the pick is stable.
const LATEST_JOURNEYS_SQL = `
  SELECT DISTINCT ON ("userId", "programmeSlug")
         "id", "assignmentId", "programmeSlug", "programmeVersionId",
         "durationDays", "status"
    FROM "programme_enrolment"
   ORDER BY "userId", "programmeSlug", "startedAt" DESC, "id" DESC
`;

// Only the journeys being measured, and each completed task once: a task
// done on two dates still counts once in countCompletedDays, so the repeat
// rows are not worth fetching. Ledger keys are uuids (see ledgerKeyFor).
const PROGRESS_SQL = `
  SELECT DISTINCT ON ("assignmentId", "taskId") ${COMPLETED_PROGRESS_COLUMNS}
    FROM "programme_task_progress"
   WHERE "outcome" = 'completed'
     AND "assignmentId" = ANY($1::uuid[])
`;

type JourneyRow = CompletionEnrolment & { status: JourneyStatus };

/**
 * The programme-completion report, computed at read time from current data:
 * nothing here is stored, so every load reflects the live state.
 *
 * Completion per journey comes from measureEnrolmentCompletion — the same
 * function behind a user's own programme history.
 */
@Injectable()
export class AdminAnalyticsService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(PROGRAMME_CONTENT_READER)
    private readonly contentReader: ProgrammeContentReader,
  ) {}

  async programmeCompletion(): Promise<ProgrammeCompletionReport> {
    const [programmeResult, journeyResult] = await Promise.all([
      this.dataSource.query(PROGRAMMES_SQL),
      this.dataSource.query(LATEST_JOURNEYS_SQL),
    ]);
    const programmes = returnedRows<ProgrammeIdentity>(programmeResult);
    const journeys = returnedRows<JourneyRow>(journeyResult);

    const ledgerKeys = journeys.map(ledgerKeyFor);
    const progress = ledgerKeys.length
      ? returnedRows<CompletedProgressRow>(
          await this.dataSource.query(PROGRESS_SQL, [ledgerKeys]),
        )
      : [];

    const completion = await measureEnrolmentCompletion(
      this.contentReader,
      journeys,
      progress,
    );

    return buildProgrammeCompletionReport(
      programmes,
      journeys.map((journey) => ({
        enrolmentId: journey.id,
        programmeSlug: journey.programmeSlug,
        status: journey.status,
      })),
      completion,
    );
  }
}
