import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

/**
 * The founding-creator seat counter: a single row whose `claimed` column is
 * incremented under a `claimed < cap` guard in the same transaction that
 * records the founding purchase, so the cap holds exactly under concurrency.
 */
@Entity({ name: "founding_cohort" })
export class FoundingCohortEntity {
  @PrimaryColumn("smallint")
  id!: number;

  @Column("integer", { default: 0 })
  claimed!: number;

  @UpdateDateColumn({ name: "updatedAt", type: "timestamptz" })
  updatedAt!: Date;
}
