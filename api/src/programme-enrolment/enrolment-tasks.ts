import type { ProgrammeContentReader } from "../challenge-setup/programmes/programme-content.repository";
import type { ProgrammeTask } from "../challenge-setup/programmes/programme-task-content";
import type { ProgrammeEnrolmentEntity } from "./entities/programme-enrolment.entity";

/**
 * The tasks a journey runs on: the content version it is pinned to, or the
 * programme's current content for journeys opened before versions existed.
 * One function so every reader picks the same content for the same journey.
 */
export function tasksForEnrolment(
  contentReader: ProgrammeContentReader,
  enrolment: Pick<ProgrammeEnrolmentEntity, "programmeSlug" | "programmeVersionId">,
): Promise<ProgrammeTask[]> {
  return enrolment.programmeVersionId
    ? contentReader.tasksForProgrammeVersion(enrolment.programmeVersionId)
    : contentReader.tasksForProgramme(enrolment.programmeSlug);
}
