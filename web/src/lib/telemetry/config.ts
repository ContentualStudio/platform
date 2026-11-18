/**
 * PostHog configuration for the web app.
 *
 * Deliberately `NEXT_PUBLIC_*`: the project API key is a publishable, write-only
 * ingestion credential, and the browser cannot report anything without it. It is
 * the *only* PostHog credential this app holds — nothing here can read a project,
 * so exposing it is exactly what it is for. A personal or secret API key must
 * never appear in this file or any variable prefixed `NEXT_PUBLIC_`.
 *
 * Server-side capture reads the same variables. That is intentional: one project,
 * one region, both runtimes. What makes server capture more reliable is not a
 * separate credential but the fact that it does not run in a browser, so no ad or
 * tracking blocker can drop it.
 */

// The EU cloud host, not the US one. A missing variable must not silently move
// user data to another region, so the EU host is the default rather than
// something each environment has to remember to set.
export const defaultPostHogHost = "https://eu.i.posthog.com";

export const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() || undefined;

export const posthogHost =
  process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || defaultPostHogHost;

/**
 * Whether PostHog is configured at all.
 *
 * An absent key disables capture rather than failing the app: local development
 * and CI must run every path without an analytics credential.
 */
export const telemetryEnabled = Boolean(posthogKey);
