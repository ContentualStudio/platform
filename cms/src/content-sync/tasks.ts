import type { TaskConfig } from "payload";
import { backfillCollection, reconcileDocument, removeDocument } from "./sync";

const collectionField = {
  name: "collection",
  required: true,
  type: "text" as const,
};

const sourceDocumentIdField = {
  name: "sourceDocumentId",
  required: true,
  type: "text" as const,
};

export const contentMirrorTasks: TaskConfig[] = [
  {
    handler: async ({ input, job, req }) => {
      const values = input as Record<string, unknown>;
      await reconcileDocument(
        req.payload,
        String(values.collection),
        String(values.sourceDocumentId),
        String(job.id),
      );
      return { output: {} };
    },
    inputSchema: [collectionField, sourceDocumentIdField],
    label: "Reconcile a content mirror document",
    retries: 3,
    slug: "mirror-document",
  },
  {
    handler: async ({ input, job }) => {
      const values = input as Record<string, unknown>;
      await removeDocument(
        String(values.collection),
        String(values.sourceDocumentId),
        String(job.id),
      );
      return { output: {} };
    },
    inputSchema: [collectionField, sourceDocumentIdField],
    label: "Remove a content mirror document",
    retries: 3,
    slug: "remove-mirror-document",
  },
  {
    handler: async ({ input, job, req }) => {
      const values = input as Record<string, unknown>;
      const mirroredDocuments = await backfillCollection(
        req.payload,
        String(values.collection),
        String(job.id),
      );
      return { output: { mirroredDocuments } };
    },
    inputSchema: [collectionField],
    label: "Backfill a content mirror collection",
    retries: 2,
    slug: "backfill-content-mirror",
  },
];
