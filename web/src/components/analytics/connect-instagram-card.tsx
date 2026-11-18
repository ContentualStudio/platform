import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { AnalyticsMessage } from "@/components/analytics/analytics-message";

/**
 * The unconnected state for each analytics section. Connecting happens on
 * /platforms — the one real connect surface — so this is a link to it.
 */
export function ConnectInstagramCard({
  title = "Connect your Instagram",
  description = "Link your Instagram account to unlock follower insights, growth trends, and post performance analytics.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <AnalyticsMessage
      description={description}
      icon={ImageIcon}
      title={title}
      action={
        <Link
          className="inline-flex items-center gap-2 rounded-full bg-primary px-9 py-3.5 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          href="/platforms"
        >
          Connect Instagram
        </Link>
      }
    />
  );
}
