import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "user" })
export class BetterAuthUserEntity {
  @PrimaryColumn("text")
  id!: string;

  @Column("text")
  name!: string;

  @Index({ unique: true })
  @Column("text")
  email!: string;

  @Column("boolean", { name: "emailVerified", default: false })
  emailVerified!: boolean;

  @Column("text", { nullable: true })
  image!: string | null;

  @CreateDateColumn({ name: "createdAt", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updatedAt", type: "timestamptz" })
  updatedAt!: Date;
}
