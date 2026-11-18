import { formatCount } from "@/components/analytics/data";
import { cn } from "@/lib/utils";
import { postTitle, safeExternalUrl, type InstagramPost } from "@/lib/instagram-posts";

/** The post's title, linking to it on Instagram when we have its link. */
export function PostTitle({ post }: { post: InstagramPost }) {
  const title = postTitle(post);
  const href = safeExternalUrl(post.permalink);

  return href ? (
    <a
      className="truncate text-sm font-semibold text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {title}
    </a>
  ) : (
    <span className="truncate text-sm font-semibold text-foreground">{title}</span>
  );
}

/**
 * A metric cell. A metric Meta did not report is left out rather than shown as
 * zero, which would read as "nobody engaged".
 */
export function MetricCell({
  value,
  className,
}: {
  value: number | null;
  className?: string;
}) {
  return (
    <span className={cn("text-sm text-muted-foreground", className)}>
      {value === null ? <span className="sr-only">Not reported</span> : formatCount(value)}
    </span>
  );
}
