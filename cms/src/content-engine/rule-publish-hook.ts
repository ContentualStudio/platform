import type { CollectionBeforeValidateHook } from "payload";
import { ValidationError } from "payload";

import {
  validateRuleForPublish,
  type AuthoredEngineRule,
} from "./rule-authoring";

const PUBLISHED_STATUS = "published";

/**
 * Gates publication of an Engine Rule.
 *
 * Drafts stay saveable however incomplete they are — an author needs to be able
 * to walk away mid-rule. Publication is the point where the rule becomes input
 * to the evaluator, so it is the point where the whole rule must validate.
 *
 * A Payload update carries only the changed fields, so the incoming data is
 * merged over the stored document before validating; validating `data` alone
 * would reject a publish that touched nothing but `_status`.
 */
export const validateEngineRuleBeforePublish: CollectionBeforeValidateHook = ({
  data,
  originalDoc,
}) => {
  const incoming = (data ?? {}) as Record<string, unknown>;
  const stored = (originalDoc ?? {}) as Record<string, unknown>;
  const merged = { ...stored, ...incoming };

  if (merged._status !== PUBLISHED_STATUS) {
    return data;
  }

  // Every field of AuthoredEngineRule is `unknown`, so a merged document is a
  // valid input by construction even when fields are missing entirely — which is
  // exactly what the validator reports on.
  const result = validateRuleForPublish(merged as unknown as AuthoredEngineRule);

  if (!result.valid) {
    throw new ValidationError({
      collection: "engine-rules",
      errors: result.errors.map((error) => ({
        message: error.message,
        path: error.field,
      })),
    });
  }

  return data;
};
