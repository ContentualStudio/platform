import { MetricCell, PostTitle } from "@/components/analytics/post-cells";
import { PostThumb } from "@/components/analytics/post-thumb";
import { formatPostDate, type InstagramPost } from "@/lib/instagram-posts";
import { cn } from "@/lib/utils";

// Recent leads with the thumbnail and ends with the date; Top leads with a
// rank. Comments and date hide below md to avoid horizontal scroll.
const COLS = {
  recent:
    "grid-cols-[44px_1fr_64px_64px] md:grid-cols-[48px_1fr_80px_80px_80px_100px]",
  top: "grid-cols-[28px_44px_1fr_64px_64px] md:grid-cols-[32px_48px_1fr_80px_80px_80px]",
} as const;

export function PostsTable({
  posts,
  variant,
}: {
  posts: InstagramPost[];
  variant: "recent" | "top";
}) {
  const ranked = variant === "top";
  const cols = COLS[variant];

  return (
    <div className="rounded-3xl bg-surface">
      <div
        className={cn(
          "grid gap-3 border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted",
          cols,
        )}
      >
        {ranked ? <span>#</span> : null}
        <span />
        <span>Post</span>
        <span>Views</span>
        <span>Likes</span>
        <span className="hidden md:block">Comments</span>
        {ranked ? null : <span className="hidden md:block">Date</span>}
      </div>
      {posts.map((post, index) => (
        <div
          className={cn(
            "grid items-center gap-3 border-b border-border px-4 py-4 transition-colors last:border-b-0 hover:bg-foreground/[0.02]",
            cols,
          )}
          key={post.id}
        >
          {ranked ? (
            <span
              className={cn(
                "text-sm font-bold",
                index < 3 ? "text-accent" : "text-muted",
              )}
            >
              {index + 1}
            </span>
          ) : null}
          <PostThumb src={post.thumbnailUrl} />
          <PostTitle post={post} />
          <MetricCell value={post.views} />
          <MetricCell value={post.likes} />
          <MetricCell className="hidden md:block" value={post.comments} />
          {ranked ? null : (
            <span className="hidden text-sm text-muted-foreground md:block">
              {formatPostDate(post.postedAt)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
