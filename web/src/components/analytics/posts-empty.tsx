import { ImageIcon } from "lucide-react";
import { AnalyticsMessage } from "@/components/analytics/analytics-message";

export function PostsEmpty({
  description = "Your post performance will appear here as you post.",
}: {
  description?: string;
}) {
  return (
    <AnalyticsMessage description={description} icon={ImageIcon} title="No posts yet" />
  );
}
