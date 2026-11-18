import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import type {
  NotificationChannel,
  NotificationType,
} from "../notification-registry";

@Entity({ name: "notification_preference" })
@Index("IDX_notification_preference_user", ["userId"])
export class NotificationPreferenceEntity {
  @PrimaryColumn("text", { name: "userId" })
  userId!: string;

  @PrimaryColumn("text", { name: "notificationType" })
  notificationType!: NotificationType;

  @PrimaryColumn("text")
  channel!: NotificationChannel;

  @Column("boolean", { name: "optedOut", default: false })
  optedOut!: boolean;

  @CreateDateColumn({ name: "createdAt", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updatedAt", type: "timestamptz" })
  updatedAt!: Date;
}
