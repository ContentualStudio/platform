import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "verification" })
export class BetterAuthVerificationEntity {
  @PrimaryColumn("text")
  id!: string;

  @Index({ unique: true })
  @Column("text")
  identifier!: string;

  @Column("text")
  value!: string;

  @Index()
  @Column("timestamptz", { name: "expiresAt" })
  expiresAt!: Date;

  @CreateDateColumn({ name: "createdAt", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updatedAt", type: "timestamptz" })
  updatedAt!: Date;
}
