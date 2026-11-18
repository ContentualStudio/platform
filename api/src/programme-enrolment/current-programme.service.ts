import { Inject, Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import type { Programme } from "../challenge-setup/programmes/programme-content";
import {
  PROGRAMME_CONTENT_READER,
  type ProgrammeContentReader,
} from "../challenge-setup/programmes/programme-content.repository";
import { ProgrammeEnrolmentService } from "./programme-enrolment.service";

/**
 * The programme a user is doing now, as distinct from the one the setup
 * questionnaire assigned them.
 *
 * For a first programme the two agree. From the second onward they diverge
 * permanently: the assignment is a historical record of what matching chose,
 * while the enrolment is the journey actually under way. Every surface that
 * answers "what am I doing today" resolves here.
 *
 * A completed or abandoned enrolment is never current — the partial unique
 * index allows only one active row per user, and this reads only that row.
 */

export interface CurrentProgramme {
  readonly slug: string;
  /** Duration of *this* journey, so a second programme counts from its own 1. */
  readonly durationDays: number;
  /** Day-1 anchor of this journey, in the user's local calendar. */
  readonly day1ScheduledFor: string;
  readonly currentDay: number;
  readonly startedAt: Date;
  /** Authored content for the version this journey is pinned to. */
  readonly programme: Programme;
  /**
   * Mirror document id of the programme content in use. User-facing surfaces
   * key off the slug, but CMS relationships (e.g. a lesson's
   * programmeRelevance) project source document ids — Studio For-you matching
   * needs this side of the identity.
   */
  readonly programmeSourceId: string;
}

@Injectable()
export class CurrentProgrammeService {
  constructor(
    private readonly enrolments: ProgrammeEnrolmentService,
    @Inject(PROGRAMME_CONTENT_READER)
    private readonly contentReader: ProgrammeContentReader,
  ) {}

  /**
   * The user's current programme, or null when there is none — before their
   * first start, or between programmes after finishing one.
   *
   * Null is a normal answer, not a failure: the no-active-programme state is
   * now reachable after a completion, not only before the first start.
   */
  async forUser(
    user: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<CurrentProgramme | null> {
    const enrolment = await this.enrolments.findActiveForUser(user.id, manager);

    if (!enrolment) {
      return null;
    }

    // Version-pinned first: a journey reads the content snapshot it started
    // against, so republishing cannot change what a mid-flight user sees.
    // Slug is the fallback for journeys opened before versions existed.
    const withIdentity = enrolment.programmeVersionId
      ? await this.contentReader.findProgrammeVersionWithIdentity(
          enrolment.programmeVersionId,
          manager,
        )
      : await this.contentReader.findProgrammeWithIdentity(
          enrolment.programmeSlug,
          manager,
        );

    if (!withIdentity) {
      // The journey is real but its content is gone from the mirror. Reporting
      // "no current programme" is the honest answer and lets every surface
      // fall back to its existing empty state rather than half-render.
      return null;
    }

    return {
      slug: enrolment.programmeSlug,
      durationDays: enrolment.durationDays,
      day1ScheduledFor: enrolment.day1ScheduledFor,
      currentDay: enrolment.currentDay,
      startedAt: enrolment.startedAt,
      programme: withIdentity.programme,
      programmeSourceId: withIdentity.sourceDocumentId,
    };
  }
}
