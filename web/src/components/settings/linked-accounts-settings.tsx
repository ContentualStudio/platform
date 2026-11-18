"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  InstagramIcon,
  LinkedInIcon,
  TikTokIcon,
  YouTubeIcon,
} from "@/components/settings/platform-icons";
import {
  PlatformBrandTile,
  SettingsOutlineButton,
  SettingsSectionLabel,
  SettingsStatusBadge,
  SettingsToggle,
} from "@/components/settings/settings-ui";
import { Spinner } from "@/components/ui/spinner";
import type { AnalyticsSnapshotResponse } from "@/lib/analytics-snapshot";
import type { ChallengeSetupStatus } from "@/schemas/challenge-setup.schema";
import type { InstagramConnectionResponse } from "@/lib/instagram-connection";
import {
  disconnectInstagram,
  InstagramServiceError,
  setInstagramConsent,
} from "@/services/instagram.service";

type PlatformGlyph = (props: { className?: string }) => React.ReactElement;

const comingSoonPlatforms: ReadonlyArray<{
  icon: PlatformGlyph;
  name: string;
  tone: string;
}> = [
  { icon: YouTubeIcon, name: "YouTube", tone: "text-[#FF0000]" },
  { icon: TikTokIcon, name: "TikTok", tone: "text-foreground" },
  {
    icon: LinkedInIcon,
    name: "LinkedIn",
    tone: "text-[#0A66C2]",
  },
];

function DataConsentRow({ granted }: { granted: boolean }) {
  const router = useRouter();
  const [consent, setConsent] = React.useState(granted);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  async function toggle() {
    const next = !consent;

    setSaving(true);
    setError("");
    setConsent(next);

    try {
      await setInstagramConsent(next);
      router.refresh();
    } catch (caught) {
      setConsent(!next);
      setError(
        caught instanceof InstagramServiceError
          ? caught.message
          : "We couldn't update your data consent. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 border-y border-border py-3.5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Data Consent</p>
          <p className="text-xs text-muted">
            {consent
              ? "Contentual pulls and stores your Instagram data daily"
              : "Paused - your history is kept, but nothing new is collected"}
          </p>
        </div>
        <SettingsToggle
          checked={consent}
          disabled={saving}
          label="Allow Contentual to pull and store your Instagram data"
          onChange={() => void toggle()}
        />
      </div>
      {error ? (
        <p className="mt-2 text-xs font-semibold text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ConnectedInstagramCard({
  connectedSince,
  dataConsent,
  username,
}: {
  connectedSince: string | null;
  dataConsent: boolean;
  username: string | null;
}) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState("");

  async function disconnect() {
    setDisconnecting(true);
    setError("");

    try {
      await disconnectInstagram();
      setConfirming(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof InstagramServiceError
          ? caught.message
          : "We couldn't disconnect Instagram. Try again.",
      );
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="mb-4 rounded-[22px] bg-surface p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <PlatformBrandTile title="Instagram">
            <InstagramIcon className="size-[22px] text-[#E4405F]" />
          </PlatformBrandTile>
          <div className="min-w-0">
            <p className="text-base font-bold text-foreground">Instagram</p>
            <p className="truncate text-[13px] text-muted">
              {username ? `@${username}` : "Account connected"}
            </p>
          </div>
        </div>
        <SettingsStatusBadge variant="connected">Connected</SettingsStatusBadge>
      </div>

      <div className="mb-5 flex items-center gap-2 text-[13px] text-muted">
        <Clock aria-hidden className="size-3.5" />
        <span>
          {connectedSince
            ? `Connected since ${connectedSince}`
            : "Sync history not available yet"}
        </span>
      </div>

      <DataConsentRow granted={dataConsent} />

      {confirming ? (
        <div className="rounded-2xl border border-destructive p-4">
          <p className="mb-2 text-sm font-semibold text-foreground">
            Disconnect Instagram and delete your data?
          </p>
          <p className="mb-4 text-sm text-muted">
            This permanently deletes your growth history, your daily snapshots,
            your post metrics and every badge you earned from follower
            milestones. It cannot be undone. Your account, your programme
            progress and the badges you earned by doing the work are kept.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <SettingsOutlineButton
              destructive
              disabled={disconnecting}
              onClick={() => void disconnect()}
              type="button"
            >
              {disconnecting ? <Spinner className="size-4" /> : null}
              {disconnecting ? "Disconnecting…" : "Yes, delete my Instagram data"}
            </SettingsOutlineButton>
            <SettingsOutlineButton
              disabled={disconnecting}
              onClick={() => setConfirming(false)}
              type="button"
            >
              Cancel
            </SettingsOutlineButton>
          </div>
          {error ? (
            <p className="mt-3 text-sm font-semibold text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <SettingsOutlineButton destructive onClick={() => setConfirming(true)} type="button">
          Disconnect
        </SettingsOutlineButton>
      )}
    </div>
  );
}

function DisconnectedInstagramCard() {
  return (
    <div className="mb-4 rounded-[22px] bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <PlatformBrandTile title="Instagram">
            <InstagramIcon className="size-[22px] text-[#E4405F]" />
          </PlatformBrandTile>
          <div className="min-w-0">
            <p className="text-base font-bold text-foreground">Instagram</p>
            <p className="text-[13px] text-muted">
              Connect Instagram to unlock follower insights and analytics.
            </p>
          </div>
        </div>
        <Link
          className="inline-flex min-h-0 items-center justify-center rounded-full border border-border bg-transparent px-4 py-2 text-[13px] font-semibold text-muted transition-colors hover:border-muted-foreground hover:text-foreground"
          href="/platforms"
        >
          Connect
        </Link>
      </div>
    </div>
  );
}

function ComingSoonCard({
  icon: Icon,
  name,
  tone,
}: {
  icon: PlatformGlyph;
  name: string;
  tone: string;
}) {
  return (
    <div className="pointer-events-none mb-4 rounded-[22px] bg-surface p-6 opacity-50 last:mb-0">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <PlatformBrandTile title={name}>
            <Icon className={cnIcon(tone)} />
          </PlatformBrandTile>
          <div className="min-w-0">
            <p className="text-base font-bold text-foreground">{name}</p>
            <p className="text-[13px] text-muted">Coming soon</p>
          </div>
        </div>
        <SettingsStatusBadge>Coming soon</SettingsStatusBadge>
      </div>
    </div>
  );
}

function cnIcon(tone: string) {
  return `size-[22px] ${tone}`;
}

export function LinkedAccountsSettings({
  analytics,
  connection,
  setup,
}: {
  analytics: AnalyticsSnapshotResponse | null;
  connection: InstagramConnectionResponse | null;
  setup: ChallengeSetupStatus | null;
}) {
  const connected =
    connection?.connected ??
    analytics?.connected ??
    setup?.answers.instagramConnected === true;
  const connectedSince =
    connection?.connection?.connectedAt ??
    analytics?.snapshot?.connectedSince ??
    null;

  return (
    <section className="w-full">
      <SettingsSectionLabel>Connected Platforms</SettingsSectionLabel>
      {connected ? (
        <ConnectedInstagramCard
          connectedSince={
            connectedSince
              ? new Date(connectedSince).toLocaleDateString("en-US", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : null
          }
          dataConsent={connection?.connection?.dataConsent ?? false}
          username={connection?.connection?.username ?? null}
        />
      ) : (
        <DisconnectedInstagramCard />
      )}
      {comingSoonPlatforms.map((platform) => (
        <ComingSoonCard
          icon={platform.icon}
          key={platform.name}
          name={platform.name}
          tone={platform.tone}
        />
      ))}
    </section>
  );
}
