import { headers } from "next/headers";
import type { ZodType } from "zod";
import { applyNamedRateLimit } from "../rate-limit";
import type { RateLimitName } from "../rate-limit/limits";
import { captureServerError } from "../telemetry/server";
import {
  failed,
  isNamedFailure,
  ok,
  sharedFailureCodes,
  type ActionResult,
} from "./result";

interface ServerActionDefinition<Input, Data> {
  /** Names the action in analytics and in error reports, e.g. `completeStage2`. */
  readonly name: string;
  /**
   * The shared Zod schema for this action's input, from `src/schemas/`.
   *
   * Required for actions that take one. A Server Action is a public POST
   * endpoint — the client is not what calls it, it is merely what *usually*
   * calls it — so its argument is untrusted input and is parsed, never cast.
   */
  readonly input?: ZodType<Input>;
  /**
   * Named limiter from `lib/rate-limit`. Applied before the handler, so an
   * over-limit call never reaches the side effect. Omit for reads.
   */
  readonly rateLimit?: RateLimitName;
  /** The message shown when the action fails unexpectedly. */
  readonly failureMessage: string;
  readonly handler: (input: Input) => Promise<Data>;
}

/**
 * Wraps a Server Action so every one behaves the same way.
 *
 * Four things every action needs and none should restate:
 *
 * - **Validation.** The input is parsed with a shared schema, so the handler's
 *   `Input` type is something the runtime actually checked rather than a claim.
 * - **One result shape.** Success, validation failure and unexpected failure all
 *   come back as `ActionResult`, so callers branch on `ok` and never on the shape
 *   of a thrown value.
 * - **Error capture.** An unexpected throw is reported to PostHog and answered
 *   with a generic message. Before this existed, actions caught everything in a
 *   bare `catch {}` and returned a friendly string, which is why nothing was ever
 *   known to be broken.
 * - **Rate limiting.** A named limiter, when set, runs before validation and
 *   before the handler, so a blocked caller never triggers a side effect.
 *
 * Note what is *not* here: the error itself, its message, and the action's input
 * never reach the caller. A thrown value can carry an upstream response body or a
 * stack; the user gets `failureMessage` and the team gets the detail in PostHog.
 * The input is not attached to the report either — it is user data by definition.
 */
export function defineServerAction<Data, Input = void>(
  definition: ServerActionDefinition<Input, Data>,
): (input: Input) => Promise<ActionResult<Data>> {
  return async (input: Input) => {
    try {
      if (definition.rateLimit) {
        await applyNamedRateLimit({
          name: definition.rateLimit,
          operation: definition.name,
          source: "action",
          headers: await headers(),
        });
      }

      let parsed = input;

      if (definition.input) {
        const result = definition.input.safeParse(input);

        if (!result.success) {
          return failed<Data>(
            sharedFailureCodes.invalidInput,
            definition.failureMessage,
          );
        }

        parsed = result.data;
      }

      return ok(await definition.handler(parsed));
    } catch (error) {
      // A named failure is the action working: answered as it asked, not
      // reported as a bug. Rate-limit refusals take this path too.
      if (isNamedFailure(error)) {
        return failed<Data>(error.code, error.message);
      }

      captureServerError(error, {
        operation: definition.name,
        source: "action",
      });

      return failed<Data>(
        sharedFailureCodes.unexpected,
        definition.failureMessage,
      );
    }
  };
}
