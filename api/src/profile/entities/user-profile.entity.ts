import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { BetterAuthUserEntity } from "../../auth/entities";

@Entity({ name: "user_profile" })
export class UserProfileEntity {
  @PrimaryColumn("text", { name: "userId" })
  userId!: string;

  @OneToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: BetterAuthUserEntity;

  @Column("timestamptz", { name: "onboardingCompletedAt", nullable: true })
  onboardingCompletedAt!: Date | null;

  @Column("text", { name: "userType", nullable: true })
  userType!: string | null;

  @Column("text", { nullable: true })
  region!: string | null;

  @Column("text", { nullable: true })
  timezone!: string | null;

  @Column("text", { array: true, nullable: true })
  platforms!: string[] | null;

  @Column("text", { name: "experienceLevel", nullable: true })
  experienceLevel!: string | null;

  @Column("text", { name: "postingFrequency", nullable: true })
  postingFrequency!: string | null;

  @Column("text", { name: "mainGoal", nullable: true })
  mainGoal!: string | null;

  @Column("text", { name: "biggestChallenge", nullable: true })
  biggestChallenge!: string | null;

  @Column("text", { nullable: true })
  bio!: string | null;

  @Column("text", { name: "avatarKey", nullable: true })
  avatarKey!: string | null;

  @Column("boolean", { name: "dailyTaskNotice", default: true })
  dailyTaskNotice!: boolean;

  @Column("boolean", { name: "badgeEarned", default: true })
  badgeEarned!: boolean;

  @Column("boolean", { name: "streakAtRisk", default: true })
  streakAtRisk!: boolean;

  @Column("boolean", { name: "milestoneReached", default: true })
  milestoneReached!: boolean;

  @Column("text", { name: "themePreference", default: "system" })
  themePreference!: "light" | "dark" | "system";

  @CreateDateColumn({ name: "createdAt", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updatedAt", type: "timestamptz" })
  updatedAt!: Date;
}
