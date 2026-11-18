"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchBillingMe } from "@/services/billing.service";

/**
 * The persistent, low-pressure upgrade path: one line in the navigation that
 * only a member who can upgrade ever sees. It deep-links to the Account
 * section, which owns the plan picker — there is no second checkout surface.
 *
 * Reads the plan on the client rather than through the static shell so the
 * sidebar stays prerenderable; until the read resolves it renders nothing,
 * which is the right default for a paid member.
 */
export function UpgradeNudge({ className }: { className?: string }) {
  const { data } = useQuery({
    queryKey: ["billing", "me"],
    queryFn: fetchBillingMe,
    staleTime: 5 * 60_000,
    // The plan only changes through the webhook; focus refetches buy nothing.
    refetchOnWindowFocus: false,
  });

  if (!data || data.entitlements.paid) {
    return null;
  }

  return (
    <Link
      className={className}
      href="/settings/account"
    >
      <Sparkles aria-hidden className="size-5" />
      Upgrade to Creator
    </Link>
  );
}
