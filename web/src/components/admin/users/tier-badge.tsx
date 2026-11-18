import { Badge } from "@/components/ui/badge";
import type { AdminUserTier } from "@/lib/admin/admin-users";

const TIER = {
  free: { label: "Free", variant: "outline" },
  creator: { label: "Creator", variant: "secondary" },
  pro: { label: "Pro", variant: "default" },
} as const;

/** A user's tier, the same everywhere the admin shows it. */
export function TierBadge({ tier }: { tier: AdminUserTier }) {
  return <Badge variant={TIER[tier].variant}>{TIER[tier].label}</Badge>;
}
