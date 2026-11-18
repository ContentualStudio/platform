export type UserMediaKind = "avatar" | "insight-card";

export type MediaBody = Buffer | Uint8Array;

export interface UploadUserMediaInput {
  userId: string;
  kind: UserMediaKind;
  fileName: string;
  contentType: string;
  body: MediaBody;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface ReplaceAvatarInput
  extends Omit<UploadUserMediaInput, "kind"> {
  previousKey?: string | null;
}

export interface StoredMedia {
  bucket: string;
  key: string;
  url: string;
  contentType: string;
  sizeBytes: number;
}

export interface DeleteUserPrefixResult {
  prefix: string;
  deletedCount: number;
}
