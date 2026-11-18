"use client";

import * as React from "react";
import { ConnectInstagramCard } from "@/components/analytics/connect-instagram-card";
import { PostsEmpty } from "@/components/analytics/posts-empty";
import { PostsTabs, type TabDef } from "@/components/analytics/posts-tabs";
import { PostsTable } from "@/components/analytics/posts-table";
import { SectionHeading } from "@/components/analytics/section-heading";
import type {
  ConnectedInstagramPosts,
  InstagramPostsResponse,
} from "@/lib/instagram-posts";

const TABS: TabDef[] = [
  { value: "recent", label: "Recent Posts" },
  { value: "top", label: "Top Posts" },
];

const ID_BASE = "posts";

function Panel({
  value,
  active,
  children,
}: {
  value: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-labelledby={`${ID_BASE}-tab-${value}`}
      hidden={!active}
      id={`${ID_BASE}-panel-${value}`}
      role="tabpanel"
      tabIndex={0}
    >
      {children}
    </div>
  );
}

export function PostsSection({ posts }: { posts: InstagramPostsResponse }) {
  return (
    <section className="mb-12">
      <SectionHeading
        subtitle="Your latest content performance."
        title="Recent Posts"
      />
      {!posts.connected ? (
        <ConnectInstagramCard
          description="Connect your Instagram to see how each of your posts is performing."
          title="No post data yet"
        />
      ) : posts.recent.length === 0 ? (
        <PostsEmpty />
      ) : (
        <PostsTabsView posts={posts} />
      )}
    </section>
  );
}

function PostsTabsView({ posts }: { posts: ConnectedInstagramPosts }) {
  const [tab, setTab] = React.useState("recent");

  return (
    <>
      <PostsTabs
        idBase={ID_BASE}
        onValueChange={setTab}
        tabs={TABS}
        value={tab}
      />
      <Panel active={tab === "recent"} value="recent">
        <PostsTable posts={posts.recent} variant="recent" />
      </Panel>
      <Panel active={tab === "top"} value="top">
        {posts.top.length > 0 ? (
          <PostsTable posts={posts.top} variant="top" />
        ) : (
          <PostsEmpty description="Top posts appear here once Instagram reports view counts for your posts." />
        )}
      </Panel>
    </>
  );
}
