import { parseBoolean, parsePositiveInt } from "./env";

export default () => ({
  gamification: {
    badgeCooldown: {
      // Its own switch, not the daily sweep's: that one exists to stop outbound
      // calls to Meta, and turning it off must not silently stop every badge
      // celebration. On by default — releasing badges touches only our own DB.
      enabled: parseBoolean(process.env.BADGE_COOLDOWN_WORKER_ENABLED, true),
      pollMs: parsePositiveInt(process.env.BADGE_COOLDOWN_POLL_MS, 60_000),
    },
  },
});
