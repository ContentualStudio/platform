import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash } from "node:crypto";
import { Repository } from "typeorm";
import { UserAvatarEntity } from "./entities/user-avatar.entity";

/**
 * The one place an avatar's bytes are written, read and deleted.
 *
 * Avatars live in Postgres because both sources — a Google picture imported at
 * signup and a file the user uploads — need somewhere every environment
 * already has. Object storage would work too, but only once a bucket, its
 * credentials and a public CDN in front of it are configured everywhere,
 * which is exactly the gap that left avatars returning 403.
 */

export const AVATAR_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export interface StoredAvatar {
  contentType: string;
  bytes: Buffer;
  etag: string;
}

@Injectable()
export class AvatarStoreService {
  private readonly maxBytes: number;

  constructor(
    @InjectRepository(UserAvatarEntity)
    private readonly avatarRepository: Repository<UserAvatarEntity>,
    private readonly configService: ConfigService,
  ) {
    this.maxBytes =
      this.configService.get<number>("aws.avatarMaxBytes") ?? 5 * 1024 * 1024;
  }

  get maxSizeBytes(): number {
    return this.maxBytes;
  }

  accepts(contentType: string): boolean {
    return AVATAR_CONTENT_TYPES.has(contentType);
  }

  /** Throws the message an upload endpoint should return to the user. */
  validate(input: { contentType: string; sizeBytes: number }): void {
    if (!this.accepts(input.contentType)) {
      throw new BadRequestException(
        "Avatar must be a JPEG, PNG, or WebP image.",
      );
    }

    if (input.sizeBytes > this.maxBytes) {
      throw new BadRequestException(
        `Avatar must be ${this.maxBytes} bytes or smaller.`,
      );
    }
  }

  /**
   * Replaces whatever the user had, and returns the URL to store on the user
   * row. The URL carries the content hash so a new avatar cannot be masked by
   * a cached copy of the old one.
   */
  async save(input: {
    userId: string;
    bytes: Buffer;
    contentType: string;
  }): Promise<{ url: string; etag: string }> {
    this.validate({
      contentType: input.contentType,
      sizeBytes: input.bytes.byteLength,
    });

    const etag = createHash("sha256").update(input.bytes).digest("hex");

    await this.avatarRepository.upsert(
      {
        userId: input.userId,
        contentType: input.contentType,
        bytes: input.bytes,
        byteSize: input.bytes.byteLength,
        etag,
      },
      ["userId"],
    );

    return { url: this.urlFor(etag), etag };
  }

  async find(userId: string): Promise<StoredAvatar | null> {
    const stored = await this.avatarRepository.findOneBy({ userId });

    return stored
      ? {
          bytes: stored.bytes,
          contentType: stored.contentType,
          etag: stored.etag,
        }
      : null;
  }

  async remove(userId: string): Promise<void> {
    await this.avatarRepository.delete({ userId });
  }

  /**
   * Absolute, because it is stored on the user row and rendered by the
   * browser. `auth.publicUrl` is where the browser reaches this api — its own
   * port locally, the first-party `/api-proxy` prefix once deployed.
   */
  private urlFor(etag: string): string {
    const publicUrl = (
      this.configService.get<string>("auth.publicUrl") ??
      "http://localhost:3001"
    ).replace(/\/$/, "");

    return `${publicUrl}/profile/me/avatar?v=${etag.slice(0, 16)}`;
  }
}
