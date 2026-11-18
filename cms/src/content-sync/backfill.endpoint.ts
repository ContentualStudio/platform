import type { Endpoint } from "payload";
import { isSyncedCollection } from "./mappings";

// Operators can queue a reconciliation without shell access. The job is still
// executed by the same retrying worker as incremental publish syncs.
export const contentMirrorBackfillEndpoint: Endpoint = {
  handler: async (req) => {
    if (!req.user) {
      return Response.json(
        { message: "Authentication is required." },
        { status: 401 },
      );
    }

    const collection = req.routeParams?.collection;

    if (typeof collection !== "string" || !isSyncedCollection(collection)) {
      return Response.json(
        { message: "Unknown content mirror collection." },
        { status: 400 },
      );
    }

    const job = await req.payload.jobs.queue({
      input: { collection },
      queue: "content-mirror",
      task: "backfill-content-mirror",
    });

    return Response.json(
      {
        collection,
        jobId: job.id,
        status: "queued",
      },
      { status: 202 },
    );
  },
  method: "post",
  path: "/content-mirror/backfill/:collection",
};
