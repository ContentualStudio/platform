import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { BetterAuthUserEntity } from "../../auth/entities";

/**
 * Avatar bytes, stored in Postgres rather than object storage.
 *
 * Kept in its own table, not a column on `user`: Better Auth base64s the whole
 * user row into the session cookie, so an image column there would travel with
 * every request. Here the bytes are read only when the image endpoint serves
 * them, and Postgres keeps a value this size out of the main heap anyway.
 */
@Entity({ name: "user_avatar" })
export class UserAvatarEntity {
  @PrimaryColumn("text", { name: "userId" })
  userId!: string;

  @OneToOne(() => BetterAuthUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: BetterAuthUserEntity;

  @Column("text", { name: "contentType" })
  contentType!: string;

  @Column("bytea")
  bytes!: Buffer;

  @Column("integer", { name: "byteSize" })
  byteSize!: number;

  /**
   * Content hash, used both as the HTTP `ETag` and as the cache-busting term
   * in the stored image URL. A new avatar therefore produces a new URL, which
   * is what stops a browser showing the previous one from cache.
   */
  @Column("text")
  etag!: string;

  @UpdateDateColumn({ name: "updatedAt", type: "timestamptz" })
  updatedAt!: Date;
}
