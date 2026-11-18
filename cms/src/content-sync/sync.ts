import type { Payload } from "payload";
import {
  deleteProjection,
  recordFailedSync,
  replaceCollection,
  upsertProjection,
} from "./app-mirror";
import {
  isSyncedCollection,
  projectDocument,
  type SourceDocument,
  type SyncedCollection,
} from "./mappings";

function assertSyncedCollection(value: string): SyncedCollection {
  if (!isSyncedCollection(value)) {
    throw new Error(`Unsupported content mirror collection: ${value}`);
  }

  return value;
}

export async function reconcileDocument(
  payload: Payload,
  collectionValue: string,
  sourceDocumentId: string,
  jobId?: string,
): Promise<void> {
  const collection = assertSyncedCollection(collectionValue);

  try {
    const result = await payload.find({
      collection,
      depth: collection === "lessons" ? 1 : 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        id: {
          equals: sourceDocumentId,
        },
      },
    });
    const document = result.docs[0] as unknown as SourceDocument | undefined;

    // A queued publish can run after a later delete. Treat that as the
    // desired delete projection, rather than retrying a permanent not-found.
    if (!document || document._status !== "published") {
      await deleteProjection(collection, sourceDocumentId, jobId);
      return;
    }

    await upsertProjection(projectDocument(collection, document), jobId);
  } catch (error) {
    await recordFailedSync(
      collection,
      "upsert",
      error,
      sourceDocumentId,
      jobId,
    );
    throw error;
  }
}

export async function removeDocument(
  collectionValue: string,
  sourceDocumentId: string,
  jobId?: string,
): Promise<void> {
  const collection = assertSyncedCollection(collectionValue);

  try {
    await deleteProjection(collection, sourceDocumentId, jobId);
  } catch (error) {
    await recordFailedSync(
      collection,
      "delete",
      error,
      sourceDocumentId,
      jobId,
    );
    throw error;
  }
}

export async function backfillCollection(
  payload: Payload,
  collectionValue: string,
  jobId?: string,
): Promise<number> {
  const collection = assertSyncedCollection(collectionValue);

  try {
    const result = await payload.find({
      collection,
      depth: collection === "lessons" ? 1 : 0,
      limit: 0,
      overrideAccess: true,
      pagination: false,
      where: {
        _status: {
          equals: "published",
        },
      },
    });
    const projections = (result.docs as unknown as SourceDocument[]).map(
      (document) => projectDocument(collection, document),
    );

    await replaceCollection(collection, projections, jobId);
    return projections.length;
  } catch (error) {
    await recordFailedSync(collection, "backfill", error, undefined, jobId);
    throw error;
  }
}
