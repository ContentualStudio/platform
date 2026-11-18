import type { CollectionConfig } from "payload";
import { isMatchingOperator, isSignedIn } from "../access/roles";
import { matchingSetupFieldNames } from "../matching/matching-authoring";

/**
 * Where the Contentual team authors who gets which programme.
 *
 * Deliberately *not* mirrored by the per-document content-sync hooks. Every
 * other collection is eventually consistent with the app database, which is
 * right for content an operator edits and republishes freely. A matching setup
 * is not that: activating it changes who gets assigned what, so it goes live
 * through one explicit, atomic publication (see `matching-publish.ts`) and
 * never through a retrying background job that might land half of it.
 *
 * Saving a draft here is therefore free and consequence-free. Publishing is the
 * separate, deliberate act.
 */
export const MatchingSetups: CollectionConfig = {
  slug: "matching-setups",
  admin: {
    useAsTitle: matchingSetupFieldNames.label,
    defaultColumns: [matchingSetupFieldNames.label, "status", "updatedAt"],
    components: {
      edit: {
        PublishButton:
          "/components/MatchingPublishButton#MatchingPublishButton",
      },
    },
    description:
      "Rules that assign a programme when someone finishes onboarding. Saving or publishing this document does NOT change matching: nothing goes live until the setup is published to the app database through the Publish matching rules action, which validates it and activates it atomically. A rejected publication leaves the setup already running untouched.",
  },
  // Authoring is restricted to matching operators. The publish and restore
  // endpoints check the same role — this is the second half of that, so a rule
  // cannot be edited into place through the normal document API by someone who
  // is merely signed in.
  access: {
    read: isSignedIn,
    create: isMatchingOperator,
    update: isMatchingOperator,
    delete: isMatchingOperator,
  },
  versions: {
    drafts: {
      autosave: true,
    },
  },
  fields: [
    {
      name: matchingSetupFieldNames.label,
      type: "text",
      required: true,
      admin: {
        description:
          "Names this setup in the published history, so versions can be told apart when one needs restoring.",
      },
    },
    {
      name: "notes",
      type: "textarea",
      admin: {
        description:
          "Why this setup exists. Recorded for whoever inherits it, not read by matching.",
      },
    },
    {
      name: matchingSetupFieldNames.rules,
      type: "json",
      defaultValue: [],
      admin: {
        components: {
          Field: "/components/MatchingRulesField#MatchingRulesField",
        },
        description:
          "Use the rule builder to choose a live programme, matching question, comparison and accepted answer. Higher priority is evaluated first; exactly one rule must be the fallback.",
      },
    },
  ],
};
