function readOptional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export default () => ({
  matchingRollout: {
    // A deployment starts by observing the new matcher while the released
    // result remains authoritative. Making the CMS matcher live is an
    // explicit operational switch, so a missing or mistyped variable cannot
    // silently cut over every new onboarding user.
    mode: readOptional(process.env.PROGRAMME_MATCHING_ROLLOUT) ?? "shadow",
  },
  programmeMatchingAdmin: {
    token: readOptional(process.env.PROGRAMME_MATCHING_ADMIN_TOKEN),
    actor: readOptional(process.env.PROGRAMME_MATCHING_ADMIN_ACTOR),
  },
});
