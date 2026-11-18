import type { CollectionConfig } from "payload";

export const Media: CollectionConfig = {
  slug: "media",
  // The s3Storage plugin sets disableLocalStorage when it is enabled. Leaving it
  // unset here lets uploads fall back to disk when S3 is not configured locally.
  upload: true,
  admin: {
    useAsTitle: "alt",
  },
  fields: [
    {
      name: "alt",
      type: "text",
      required: true,
    },
  ],
};
