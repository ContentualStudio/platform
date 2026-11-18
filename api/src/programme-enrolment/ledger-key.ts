import type { ProgrammeEnrolmentEntity } from "./entities/programme-enrolment.entity";

/**
 * The id a journey's durable rows are filed under.
 *
 * `programme_task_progress`, `programme_week_completion` and
 * `programme_completion` all key by `assignmentId`, which predates programmes
 * being startable outside matching. A journey opened without an assignment
 * files under its own enrolment id instead, so every journey has exactly one
 * ledger key and two journeys can never share rows.
 *
 * One function rather than a `??` at each write site: this derivation decides
 * where durable data lands, and two copies of it could drift into filing the
 * same journey's rows under two different keys.
 */
export function ledgerKeyFor(
  enrolment: Pick<ProgrammeEnrolmentEntity, "id" | "assignmentId">,
): string {
  return enrolment.assignmentId ?? enrolment.id;
}
