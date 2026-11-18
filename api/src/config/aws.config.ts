export default () => ({
  aws: {
    region: process.env.AWS_REGION ?? "us-east-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3BucketName: process.env.AWS_S3_BUCKET_NAME,
    s3CdnBaseUrl: process.env.AWS_S3_CDN_BASE_URL,
    avatarMaxBytes: Number(process.env.AVATAR_MAX_BYTES ?? 5 * 1024 * 1024),
  },
});
