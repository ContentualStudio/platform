import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "session" })
export class BetterAuthSessionEntity {
  @PrimaryColumn("text")
  id!: string;

  @Index({ unique: true })
  @Column("text")
  token!: string;

  @Column("timestamptz", { name: "expiresAt" })
  expiresAt!: Date;

  @Column("text", { name: "ipAddress", nullable: true })
  ipAddress!: string | null;

  @Column("text", { name: "userAgent", nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: "createdAt", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updatedAt", type: "timestamptz" })
  updatedAt!: Date;

  @Index()
  @Column("text", { name: "userId" })
  userId!: string;
}
