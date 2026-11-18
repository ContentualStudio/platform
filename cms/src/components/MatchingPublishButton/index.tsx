"use client";

import {
  useConfig,
  useDocumentInfo,
  useForm,
  useFormProcessing,
} from "@payloadcms/ui";
import React from "react";
import "./index.scss";

/**
 * Payload's normal Publish button only changes `_status`. Matching publication
 * is a separate app-database transaction, so this control saves a draft and
 * then calls the explicit endpoint that validates, materializes content and
 * swaps the runtime pointer atomically.
 */
export const MatchingPublishButton = () => {
  const { config } = useConfig();
  const { id, hasPublishPermission } = useDocumentInfo();
  const { submit } = useForm();
  const processing = useFormProcessing();
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");

  const publish = async () => {
    if (!id || !hasPublishPermission || processing) {
      return;
    }

    setMessage("");
    setError("");

    try {
      const saveResult = await submit({
        action: `${config.routes.api}/matching-setups/${id}?depth=0&draft=true`,
        method: "PATCH",
        overrides: { _status: "draft" },
        skipValidation: true,
      });

      if (!saveResult) {
        throw new Error("The draft could not be saved.");
      }

      const response = await fetch(
        `${config.routes.api}/matching-setups/${id}/publish`,
        { credentials: "same-origin", method: "POST" },
      );
      const result = (await response.json()) as {
        errors?: Array<{ message?: string }>;
        version?: { setupVersionId?: string };
      };

      if (!response.ok) {
        throw new Error(
          result.errors?.[0]?.message ?? "Matching rules were not published.",
        );
      }

      setMessage(
        `Published ${result.version?.setupVersionId ?? "new matching version"}.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Publication failed.");
    }
  };

  return (
    <div className="matching-publish-button">
      <button
        disabled={!id || !hasPublishPermission || processing}
        onClick={() => void publish()}
        type="button"
      >
        {processing ? "Saving…" : "Publish matching rules"}
      </button>
      {message ? <span role="status">{message}</span> : null}
      {error ? <span role="alert">{error}</span> : null}
    </div>
  );
};
