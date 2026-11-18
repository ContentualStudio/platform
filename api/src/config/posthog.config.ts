// Surrounding quotes are stripped as well as whitespace. Nest's ConfigModule
// parses .env with dotenv, which removes them, but the hand-rolled loader in
// database/data-source.ts — which every script and migration goes through —
// does not. So `POSTHOG_API_KEY=""`, the ordinary way to write "no credential",
// reaches this function as a two-character string under scripts and as an empty
// one under the app. Treating those differently would mean a script building a
// PostHog client around a junk key and silently dropping every event, which is
// indistinguishable from working.
function readOptional(value?: string) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1).trim()
      : trimmed;

  return unquoted ? unquoted : undefined;
}

// The EU cloud host, not the US one. Every environment reports into the EU
// region, so this is the default rather than something each deployment has to
// remember to set — a missing POSTHOG_HOST must not silently move user data to
// another region.
export const defaultPostHogHost = "https://eu.i.posthog.com";

// An absent key disables capture rather than failing startup. Observability is
// how the product is watched, never a precondition for running it: local and CI
// runs must exercise every capture path without an analytics credential, so the
// missing key has to be a supported state, not an error.
export default () => {
  const apiKey = readOptional(process.env.POSTHOG_API_KEY);

  return {
    posthog: {
      apiKey,
      host: readOptional(process.env.POSTHOG_HOST) ?? defaultPostHogHost,
      enabled: Boolean(apiKey),
    },
  };
};
