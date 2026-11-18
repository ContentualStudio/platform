import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import {
  DeleteUserPrefixResult,
  ReplaceAvatarInput,
  StoredMedia,
  UploadUserMediaInput,
} from "./storage.types";

const AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  private readonly bucketName?: string;
  private readonly cdnBaseUrl?: string;
  private readonly avatarMaxBytes: number;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>("aws.region");
    const accessKeyId = this.configService.get<string>("aws.accessKeyId");
    const secretAccessKey = this.configService.get<string>(
      "aws.secretAccessKey",
    );

    this.bucketName = this.configService.get<string>("aws.s3BucketName");
    this.cdnBaseUrl = this.configService
      .get<string>("aws.s3CdnBaseUrl")
      ?.replace(/\/+$/, "");
    this.avatarMaxBytes =
      this.configService.get<number>("aws.avatarMaxBytes") ?? 5 * 1024 * 1024;

    this.s3 = new S3Client({
      region,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
    });
  }

  /**
   * Whether uploads can actually be stored and served.
   *
   * Callers that merely *prefer* to store something — importing a social
   * avatar, say — check this rather than catching the exception the `require*`
   * helpers throw, so a missing bucket stays a configuration state instead of
   * an error path.
   */
  isConfigured(): boolean {
    return Boolean(this.bucketName && this.cdnBaseUrl);
  }

  get avatarMaxSizeBytes(): number {
    return this.avatarMaxBytes;
  }

  async uploadUserMedia(input: UploadUserMediaInput): Promise<StoredMedia> {
    const sizeBytes = this.getBodySize(input.body);
    const key = this.buildUserMediaKey(input);
    const bucketName = this.requireBucketName();

    await this.s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: input.cacheControl ?? "public, max-age=31536000, immutable",
        Metadata: input.metadata,
      }),
    );

    return {
      bucket: bucketName,
      key,
      url: this.resolveUrl(key),
      contentType: input.contentType,
      sizeBytes,
    };
  }

  async replaceAvatar(input: ReplaceAvatarInput): Promise<StoredMedia> {
    this.validateAvatarFile({
      contentType: input.contentType,
      sizeBytes: this.getBodySize(input.body),
    });

    const uploaded = await this.uploadUserMedia({
      ...input,
      kind: "avatar",
    });

    if (input.previousKey && input.previousKey !== uploaded.key) {
      await this.deleteObject(input.previousKey);
    }

    return uploaded;
  }

  validateAvatarFile(input: {
    contentType: string;
    sizeBytes: number;
  }): void {
    if (!AVATAR_MIME_TYPES.has(input.contentType)) {
      throw new BadRequestException("Avatar must be a JPEG, PNG, or WebP image.");
    }

    if (input.sizeBytes > this.avatarMaxBytes) {
      throw new BadRequestException(
        `Avatar must be ${this.avatarMaxBytes} bytes or smaller.`,
      );
    }
  }

  resolveUrl(key: string): string {
    return `${this.requireCdnBaseUrl()}/${this.encodeKeyPath(key)}`;
  }

  async deleteObject(key: string): Promise<void> {
    const bucketName = this.requireBucketName();

    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );
  }

  async deleteByUserPrefix(userId: string): Promise<DeleteUserPrefixResult> {
    const bucketName = this.requireBucketName();
    const prefix = this.userPrefix(userId);
    let continuationToken: string | undefined;
    let deletedCount = 0;

    do {
      const listed = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const objects =
        listed.Contents?.map((object) => object.Key)
          .filter((key): key is string => Boolean(key))
          .map((key) => ({ Key: key })) ?? [];

      for (let index = 0; index < objects.length; index += 1000) {
        const batch = objects.slice(index, index + 1000);

        if (batch.length > 0) {
          await this.s3.send(
            new DeleteObjectsCommand({
              Bucket: bucketName,
              Delete: {
                Objects: batch,
                Quiet: true,
              },
            }),
          );
          deletedCount += batch.length;
        }
      }

      continuationToken = listed.NextContinuationToken;
    } while (continuationToken);

    return {
      prefix,
      deletedCount,
    };
  }

  userPrefix(userId: string): string {
    return `users/${this.safePathSegment(userId)}/`;
  }

  private buildUserMediaKey(input: UploadUserMediaInput): string {
    const extension = this.safeExtension(input.fileName);
    return [
      this.userPrefix(input.userId).replace(/\/$/, ""),
      input.kind,
      `${Date.now()}-${randomUUID()}${extension}`,
    ].join("/");
  }

  private getBodySize(body: Buffer | Uint8Array): number {
    return Buffer.byteLength(body);
  }

  private safeExtension(fileName: string): string {
    const match = fileName.match(/\.[a-zA-Z0-9]+$/);
    return match ? match[0].toLowerCase() : "";
  }

  private safePathSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9-_]/g, "_");
  }

  private encodeKeyPath(key: string): string {
    return key.split("/").map(encodeURIComponent).join("/");
  }

  private requireBucketName(): string {
    if (!this.bucketName) {
      throw new Error("AWS_S3_BUCKET_NAME is required");
    }

    return this.bucketName;
  }

  private requireCdnBaseUrl(): string {
    if (!this.cdnBaseUrl) {
      throw new Error("AWS_S3_CDN_BASE_URL is required");
    }

    return this.cdnBaseUrl;
  }
}
