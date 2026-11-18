import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { BetterAuthUserEntity } from "../../auth/entities";
import { ProgrammeEnrolmentEntity } from "./programme-enrolment.entity";

export const programmeDayServeOutcomes = ["served", "gap_skipped"] as const;

export type ProgrammeDayServeOutcome =
  (typeof programmeDayServeOutcomes)[number];

@Entity({ name: "programme_day_serve" })
@Index("UQ_programme_day_serve_enrolment_day", ["enrolmentId", "programmeDay"], {
  unique: true,
})
@Check("CHK_programme_day_serve_day", `"programmeDay" > 0`)
@Check(
  "CHK_programme_day_serve_outcome",
  `"outcome" IN ('served', 'gap_skipped')`,
)
export class ProgrammeDayServeEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column("uuid", { name: "enrolmentId" })
  enrolmentId!: string;

  @ManyToOne(() => ProgrammeEnrolmentEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "enrolmentId" })
  enrolment!: ProgrammeEnrolmentEntity;

  @Column("text", { name: "userId" })
  userId!: string;

  @ManyToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: BetterAuthUserEntity;

  @Column("text", { name: "programmeSlug" })
  programmeSlug!: string;

  @Column("integer", { name: "programmeDay" })
  programmeDay!: number;

  @Column("date", { name: "localDate" })
  localDate!: string;

  @Column("text", { name: "taskId", nullable: true })
  taskId!: string | null;

  @Column("text")
  outcome!: ProgrammeDayServeOutcome;

  @Column("timestamptz", { name: "servedAt", default: () => "now()" })
  servedAt!: Date;
}
