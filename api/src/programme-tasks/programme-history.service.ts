import { Inject, Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import type { Programme } from "../challenge-setup/programmes/programme-content";
import {
  PROGRAMME_CONTENT_READER,
  type ProgrammeContentReader,
} from "../challenge-setup/programmes/programme-content.repository";
import type { ProgrammeEnrolmentStatus } from "../programme-enrolment/entities/programme-enrolment.entity";
import { ProgrammeEnrolmentService } from "../programme-enrolment/programme-enrolment.service";
import {
  COMPLETED_PROGRESS_COLUMNS,
  measureEnrolmentCompletion,
  type CompletedProgressRow,
} from "./enrolment-completion";

const SELECT_COMPLETED_PROGRESS_SQL = `
  SELECT ${COMPLETED_PROGRESS_COLUMNS}
  FROM "programme_task_progress"
  WHERE "userId" = $1 AND "outcome" = 'completed'
`;

export interface ProgrammeHistoryEntry {
  readonly enrolmentId: string;
  readonly slug: string;
  /** Null when the programme is gone from the mirror; the UI labels it neutrally. */
  readonly title: string | null;
  readonly track: string | null;
  readonly status: ProgrammeEnrolmentStatus;
  readonly startedAt: string;
  /** When the journey ended — completed or abandoned. Null while in progress. */
  readonly endedAt: string | null;
  readonly durationDays: number;
  readonly completedDays: number;
  /** Whole number, 0–100: completed days over the programme's duration. */
  readonly completionPercent: number;
}

export interface ProgrammeHistory {
  readonly inProgress: ProgrammeHistoryEntry[];
  readonly past: ProgrammeHistoryEntry[];
}

/**
 * Every programme a user has started, with how much of each they did.
 *
 * Read-only: nothing here resumes, restarts or re-enrols. Progress is matched
 * to a journey by its ledger key, not by programme, so running the same
 * programme twice shows two entries with their own percentages.
 */
@Injectable()
export class ProgrammeHistoryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly enrolments: ProgrammeEnrolmentService,
    @Inject(PROGRAMME_CONTENT_READER)
    private readonly contentReader: ProgrammeContentReader,
  ) {}

  forUser(user: AuthenticatedUser): Promise<ProgrammeHistory> {
    return this.forUserId(user.id);
  }

  /** The same history for any user id — the admin user view reads this. */
  async forUserId(userId: string): Promise<ProgrammeHistory> {
    const [enrolments, progress] = await Promise.all([
      this.enrolments.listForUser(userId),
      this.dataSource.query<CompletedProgressRow[]>(SELECT_COMPLETED_PROGRESS_SQL, [
        userId,
      ]),
    ]);

    // The current name, not the version the journey ran: history names what
    // the programme is called now. One read per slug; a missing row is not an
    // error.
    const slugs = [...new Set(enrolments.map((enrolment) => enrolment.programmeSlug))];
    const [completion, programmeList] = await Promise.all([
      measureEnrolmentCompletion(this.contentReader, enrolments, progress),
      Promise.all(slugs.map((slug) => this.contentReader.findProgramme(slug))),
    ]);
    const programmes = new Map<string, Programme | undefined>(
      slugs.map((slug, index) => [slug, programmeList[index]]),
    );

    const entries = enrolments.map((enrolment) => {
      const programme = programmes.get(enrolment.programmeSlug);
      const { completedDays, completionPercent } = completion.get(enrolment.id) ?? {
        completedDays: 0,
        completionPercent: 0,
      };
      const endedAt = enrolment.completedAt ?? enrolment.abandonedAt;

      return {
        enrolmentId: enrolment.id,
        slug: enrolment.programmeSlug,
        title: programme?.title ?? null,
        track: programme?.track ?? null,
        status: enrolment.status,
        startedAt: new Date(enrolment.startedAt).toISOString(),
        endedAt: endedAt ? new Date(endedAt).toISOString() : null,
        durationDays: enrolment.durationDays,
        completedDays,
        completionPercent,
      } satisfies ProgrammeHistoryEntry;
    });

    // Only a journey that has ended is past; anything else — including any
    // future non-ended status such as paused — reads as in progress.
    return {
      inProgress: entries.filter((entry) => !hasEnded(entry.status)),
      past: entries.filter((entry) => hasEnded(entry.status)),
    };
  }
}

function hasEnded(status: ProgrammeEnrolmentStatus): boolean {
  return status === "completed" || status === "abandoned";
}
