/**
 * Reading values back out of Payload documents.
 *
 * These are the trust boundary every authoring validator crosses: the admin UI,
 * the REST API and a partial update all produce documents, and none of them are
 * trusted to have produced a well-formed field. Kept in one place so a change to
 * how Payload delivers a relationship is found once rather than in each
 * validator that happens to read one.
 */

/**
 * Payload relationships arrive either as a bare ID or as a populated document,
 * depending on the request's depth. Anything else — an unresolved object, null,
 * an empty selection — is not a usable target.
 */
export function relationshipSourceId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string") {
    return value.trim() === "" ? null : value;
  }

  if (value && typeof value === "object" && "id" in value) {
    return relationshipSourceId((value as { id: unknown }).id);
  }

  return null;
}

/** A non-empty trimmed string, or null. Never an empty string. */
export function trimmedText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
