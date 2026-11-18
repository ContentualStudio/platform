import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { NotificationType } from "../notification-registry";

@Entity({ name: "in_app_notification" })
@Index("UQ_in_app_notification_user_dedupe", ["userId", "dedupeKey"], {
  unique: true,
})
@Index("IDX_in_app_notification_inbox", [
  "userId",
  "dismissedAt",
  "createdAt",
  "id",
])
@Index("IDX_in_app_notification_unread", [
  "userId",
  "dismissedAt",
  "readAt",
])
export class InAppNotificationEntity {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Column("text")
  userId!: string;

  @Column("text", { nullable: true })
  notificationType!: NotificationType | null;

  @Column("text")
  title!: string;

  @Column("text")
  message!: string;

  @Column("text", { nullable: true })
  actionUrl!: string | null;

  @Column("text")
  dedupeKey!: string;

  @Column("bigint", { nullable: true })
  sourceEngineMessageId!: string | null;

  @Column("text", { nullable: true })
  sourceRuleId!: string | null;

  @Column("text", { nullable: true })
  sourceEventId!: string | null;

  @CreateDateColumn({ name: "createdAt", type: "timestamptz" })
  createdAt!: Date;

  @Column("timestamptz", { nullable: true })
  readAt!: Date | null;

  @Column("timestamptz", { nullable: true })
  dismissedAt!: Date | null;
}
