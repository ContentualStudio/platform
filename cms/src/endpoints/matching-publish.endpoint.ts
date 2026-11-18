import type { Endpoint, PayloadRequest } from "payload";
import { hasRole, userRoleTokens } from "../access/roles";
import {
  validateMatchingSetupForPublish,
  type AuthoredMatchingSetup,
  type MatchingValidationError,
} from "../matching/matching-authoring";
import {
  listPublishedVersions,
  publishMatchingSetup,
  recordRejectedAttempt,
  restoreMatchingSetup,
  UnknownMatchingVersionError,
} from "../matching/matching-publish";
import { payloadProgrammeTargets } from "../matching/programme-targets";

const MATCHING_SETUPS = "matching-setups";

interface OperatorIdentity {
  actor: string;
  correlationId: string;
}

// Named identity, not a shared token. A publication changes who every future
// user is matched to, so "who did this" has to be answerable from the record
// alone — and being signed in is not enough to be the one who did it.
function identify(req: PayloadRequest): OperatorIdentity | null {
  if (
    !req.user ||
    !hasRole(req, userRoleTokens.admin, userRoleTokens.matchingOperator)
  ) {
    return null;
  }

  return {
    actor: String(req.user.email ?? req.user.id),
    correlationId:
      req.headers.get("x-correlation-id") ?? `publish-${Date.now()}`,
  };
}

function unauthorised(): Response {
  return Response.json(
    {
      message:
        "Publishing matching rules requires the matching operator role.",
    },
    // 403, not 401: the caller may well be signed in and simply not permitted,
    // and telling them to sign in again would send them round a loop.
    { status: 403 },
  );
}

function rejection(errors: readonly MatchingValidationError[]): Response {
  return Response.json(
    {
      published: false,
      // The previous setup is still the live one. Saying so in the response is
      // what stops an operator assuming a failed publish took half effect.
      activeSetupUnchanged: true,
      errors,
    },
    { status: 422 },
  );
}

async function loadDraft(
  req: PayloadRequest,
  id: string,
): Promise<AuthoredMatchingSetup | null> {
  const result = await req.payload.find({
    collection: MATCHING_SETUPS,
    depth: 0,
    draft: true,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { id: { equals: id } },
  });

  return (result.docs[0] as AuthoredMatchingSetup | undefined) ?? null;
}

async function restoreDraft(
  req: PayloadRequest,
  id: string,
  setupVersionId: string,
  identity: OperatorIdentity,
): Promise<Response> {
  const draft = await loadDraft(req, id);

  if (!draft) {
    return Response.json({ message: "Unknown matching setup." }, { status: 404 });
  }

  try {
    const result = await restoreMatchingSetup({
      sourceDocumentId: id,
      setupVersionId,
      label: `Restored: ${String((draft as { label?: unknown }).label ?? "").trim()}`,
      programmes: payloadProgrammeTargets(req.payload),
      actor: identity.actor,
      correlationId: identity.correlationId,
    });

    // A version that no longer validates is refused the same way an invalid
    // draft is, and for the same reason: the setup already running is left
    // running.
    return result.published
      ? Response.json(result, { status: 200 })
      : rejection(result.errors);
  } catch (error) {
    if (error instanceof UnknownMatchingVersionError) {
      return Response.json({ message: error.message }, { status: 404 });
    }

    throw error;
  }
}

/**
 * Publishes a draft setup: validate the whole thing, then write and activate it
 * atomically.
 *
 * Validation runs before any write, and a rejection is recorded as an attempt
 * rather than as a partial publication — the live setup is untouched either
 * way. That ordering is what makes "a failed publication leaves the previous
 * working setup active" true rather than merely intended.
 */
export const matchingPublishEndpoint: Endpoint = {
  handler: async (req) => {
    const identity = identify(req);

    if (!identity) {
      return unauthorised();
    }

    const id = req.routeParams?.id;

    if (typeof id !== "string") {
      return Response.json({ message: "Unknown matching setup." }, { status: 400 });
    }

    const draft = await loadDraft(req, id);

    if (!draft) {
      return Response.json({ message: "Unknown matching setup." }, { status: 404 });
    }

    const validation = await validateMatchingSetupForPublish(
      draft,
      payloadProgrammeTargets(req.payload),
    );

    if (!validation.valid) {
      await recordRejectedAttempt({
        sourceDocumentId: id,
        errors: validation.errors,
        actor: identity.actor,
        correlationId: identity.correlationId,
      });

      return rejection(validation.errors);
    }

    const version = await publishMatchingSetup({
      sourceDocumentId: id,
      label: String((draft as { label?: unknown }).label ?? "").trim(),
      rules: validation.rules,
      actor: identity.actor,
      correlationId: identity.correlationId,
      programmeTargets: validation.programmeTargets,
    });

    return Response.json({ published: true, version }, { status: 200 });
  },
  method: "post",
  path: `/${MATCHING_SETUPS}/:id/publish`,
};

/** Published history, newest first, with the live version flagged. */
export const matchingVersionsEndpoint: Endpoint = {
  handler: async (req) => {
    // Readable by any signed-in operator: knowing which version is live is
    // useful during an incident, and it exposes no rule content.
    if (!req.user) {
      return Response.json(
        { message: "Sign in to view published matching versions." },
        { status: 401 },
      );
    }

    return Response.json({ versions: await listPublishedVersions() });
  },
  method: "get",
  path: `/${MATCHING_SETUPS}/versions`,
};

/**
 * Restores a previous published version.
 *
 * The response names the *new* version rather than the restored one, because
 * that is what is now live and what future assignments will cite.
 */
export const matchingRestoreEndpoint: Endpoint = {
  handler: async (req) => {
    const identity = identify(req);

    if (!identity) {
      return unauthorised();
    }

    const id = req.routeParams?.id;
    const setupVersionId = req.routeParams?.versionId;

    if (typeof id !== "string" || typeof setupVersionId !== "string") {
      return Response.json(
        { message: "A matching setup and a published version are required." },
        { status: 400 },
      );
    }

    return restoreDraft(req, id, setupVersionId, identity);
  },
  method: "post",
  path: `/${MATCHING_SETUPS}/:id/restore/:versionId`,
};
