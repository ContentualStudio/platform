import type { CollectionConfig } from "payload";
import type { SyncedCollection } from "./mappings";

export function contentSyncHooks(
  collection: SyncedCollection,
): NonNullable<CollectionConfig["hooks"]> {
  return {
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        // Avoid a queue entry for draft-only edits. A transition away from
        // published is still reconciled, which removes the old mirror row.
        if (
          doc._status !== "published" &&
          previousDoc?._status !== "published"
        ) {
          return doc;
        }

        await req.payload.jobs.queue({
          input: {
            collection,
            sourceDocumentId: String(doc.id),
          },
          queue: "content-mirror",
          task: "mirror-document",
        });

        return doc;
      },
    ],
    afterDelete: [
      async ({ id, req }) => {
        await req.payload.jobs.queue({
          input: {
            collection,
            sourceDocumentId: String(id),
          },
          queue: "content-mirror",
          task: "remove-mirror-document",
        });
      },
    ],
  };
}
