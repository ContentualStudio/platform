import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "account" })
export class BetterAuthAccountEntity {
  @PrimaryColumn("text")
  id!: string;

  @Index()
  @Column("text", { name: "accountId" })
  accountId!: string;

  @Index()
  @Column("text", { name: "providerId" })
  providerId!: string;

  @Index()
  @Column("text", { name: "userId" })
  userId!: string;

  @Column("text", { name: "accessToken", nullable: true })
  accessToken!: string | null;

  @Column("text", { name: "refreshToken", nullable: true })
  refreshToken!: string | null;

  @Column("text", { name: "idToken", nullable: true })
  idToken!: string | null;

  @Column("timestamptz", { name: "accessTokenExpiresAt", nullable: true })
  accessTokenExpiresAt!: Date | null;

  @Column("timestamptz", { name: "refreshTokenExpiresAt", nullable: true })
  refreshTokenExpiresAt!: Date | null;

  @Column("text", { nullable: true })
  scope!: string | null;

  @Column("text", { nullable: true })
  password!: string | null;

  @CreateDateColumn({ name: "createdAt", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updatedAt", type: "timestamptz" })
  updatedAt!: Date;
}
