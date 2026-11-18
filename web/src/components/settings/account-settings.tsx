"use client";

import * as React from "react";
import { Check, ChevronRight, Copy, Lock, PartyPopper } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlanningModal } from "@/components/planning/planning-modal";
import {
  SettingsOutlineButton,
  SettingsPrimaryButton,
  SettingsRow,
  SettingsSectionLabel,
  SettingsStatusBadge,
} from "@/components/settings/settings-ui";
import { Spinner } from "@/components/ui/spinner";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";
import {
  formatPrice,
  tierDisplayName,
  type BillingCatalogue,
  type BillingMe,
  type CheckoutTier,
  type PublicTier,
} from "@/schemas/billing.schema";
import {
  BillingServiceError,
  fetchBillingMe,
  openBillingPortal,
  startCheckout,
} from "@/services/billing.service";
import {
  ProfileServiceError,
  updateThemePreference,
} from "@/services/profile.service";

export type CheckoutReturnState = "success" | "cancelled" | null;

// How long the "confirming" state keeps asking the api whether the webhook
// has landed. Stripe usually delivers within seconds; a minute covers a slow
// retry without leaving a spinner running forever.
const CONFIRM_POLL_MS = 2_500;
const CONFIRM_POLL_ATTEMPTS = 24;

export function AccountSettings({
  billing,
  catalogue,
  checkoutState,
  savedTheme,
}: {
  billing: BillingMe | null;
  catalogue: BillingCatalogue | null;
  checkoutState: CheckoutReturnState;
  savedTheme: "light" | "dark" | "system";
}) {
  const router = useRouter();
  const { preference, setPreference } = useTheme();
  const [savingTheme, setSavingTheme] = React.useState(false);
  const [themeError, setThemeError] = React.useState("");

  async function saveTheme(theme: "light" | "dark" | "system") {
    if (savingTheme || theme === preference) {
      return;
    }

    setPreference(theme);
    setSavingTheme(true);
    setThemeError("");

    try {
      const response = await updateThemePreference({ theme });
      setPreference(response.preferences.theme);
      router.refresh();
    } catch (error) {
      setPreference(savedTheme);
      setThemeError(
        error instanceof ProfileServiceError
          ? error.message
          : "We couldn't save your theme preference. Try again.",
      );
    } finally {
      setSavingTheme(false);
    }
  }

  return (
    <div className="w-full">
      <SubscriptionSection
        billing={billing}
        catalogue={catalogue}
        checkoutState={checkoutState}
      />

      <ReferralSection referral={billing?.referral ?? null} />

      <section className="mb-9">
        <SettingsSectionLabel>Appearance</SettingsSectionLabel>
        <SettingsRow
          action={
            <SettingsOutlineButton
              disabled={savingTheme}
              onClick={() =>
                void saveTheme(preference === "dark" ? "light" : "dark")
              }
              type="button"
            >
              Toggle theme
            </SettingsOutlineButton>
          }
          description="Light / Dark / Follow system"
          title="Theme"
        />
        {themeError ? (
          <p className="mt-2 text-sm font-medium text-destructive" role="alert">
            {themeError}
          </p>
        ) : null}
      </section>

      <section>
        <SettingsSectionLabel>Data &amp; Privacy</SettingsSectionLabel>
        <SettingsRow
          action={<ChevronRight className="size-4 text-muted opacity-30" />}
          description="Download all your activity and profile data"
          title="Export my data"
        />
        <SettingsRow
          action={
            <ChevronRight className="size-4 text-destructive opacity-50" />
          }
          description="Permanently remove your data within 30 days"
          title="Delete my account"
          type="delete"
        />
      </section>
    </div>
  );
}

function formatDate(iso: string | null): string | null {
  if (!iso) {
    return null;
  }

  const date = new Date(iso);

  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
}

function SubscriptionSection({
  billing,
  catalogue,
  checkoutState,
}: {
  billing: BillingMe | null;
  catalogue: BillingCatalogue | null;
  checkoutState: CheckoutReturnState;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const entitlements = billing?.entitlements ?? null;
  const tier = entitlements?.tier ?? "free";
  const paid = entitlements?.paid ?? false;
  const [busy, setBusy] = React.useState<CheckoutTier | "portal" | null>(null);
  const [error, setError] = React.useState("");
  // Checkout returned but the webhook has not landed yet: keep asking until
  // the api says paid, then re-render the page from the server.
  const [confirming, setConfirming] = React.useState(
    checkoutState === "success" && !paid,
  );
  // Shown once the new plan is confirmed — on this page's poll, or straight
  // away when the webhook beat the redirect back from Checkout.
  const [welcome, setWelcome] = React.useState<BillingMe["entitlements"] | null>(
    checkoutState === "success" && paid ? entitlements : null,
  );

  const closeWelcome = React.useCallback(() => {
    setWelcome(null);
    // Drop ?checkout=success so a reload doesn't celebrate twice.
    router.replace("/settings/account", { scroll: false });
  }, [router]);

  React.useEffect(() => {
    if (!confirming) {
      return;
    }

    let attempts = 0;
    let cancelled = false;

    const poll = async () => {
      attempts += 1;

      try {
        const next = await fetchBillingMe();

        if (cancelled) {
          return;
        }

        if (next.entitlements.paid) {
          setConfirming(false);
          setWelcome(next.entitlements);
          queryClient.setQueryData(["billing", "me"], next);
          router.refresh();
          return;
        }
      } catch {
        // A failed poll is retried on the next tick; the timeout below is
        // what ends the loop.
      }

      if (attempts >= CONFIRM_POLL_ATTEMPTS) {
        setConfirming(false);
        setError(
          "Your payment is taking a moment to confirm. Refresh in a minute - if it still shows Free, contact support.",
        );
        return;
      }

      timer = window.setTimeout(() => void poll(), CONFIRM_POLL_MS);
    };

    let timer = window.setTimeout(() => void poll(), CONFIRM_POLL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [confirming, queryClient, router]);

  // Both Stripe hand-offs: ask the api for a hosted url, then leave the app.
  async function redirectTo(
    target: CheckoutTier | "portal",
    request: () => Promise<{ url: string }>,
  ) {
    if (busy) {
      return;
    }

    setBusy(target);
    setError("");

    try {
      window.location.assign((await request()).url);
    } catch (caught) {
      setError(
        caught instanceof BillingServiceError
          ? caught.message
          : "We couldn't reach billing. Try again.",
      );
      setBusy(null);
    }
  }

  const currentOrder =
    catalogue?.tiers.find((candidate) => candidate.key === tier)?.order ?? 0;
  const upgradeTiers = (catalogue?.tiers ?? []).filter(
    (candidate) => candidate.order > currentOrder,
  );

  return (
    <section className="mb-9">
      <SettingsSectionLabel>Subscription</SettingsSectionLabel>

      {welcome ? (
        <SubscriptionWelcome
          entitlements={welcome}
          onClose={closeWelcome}
          tier={catalogue?.tiers.find((candidate) => candidate.key === welcome.tier) ?? null}
        />
      ) : null}

      {confirming ? (
        <div
          className="mb-4 flex items-center gap-3 rounded-2xl bg-accent-soft px-5 py-4 text-sm font-medium text-foreground"
          role="status"
        >
          <Spinner className="size-4" />
          Confirming your payment with Stripe…
        </div>
      ) : null}

      {checkoutState === "cancelled" && !paid ? (
        <p className="mb-4 text-sm text-muted" role="status">
          Checkout was cancelled. Nothing was charged.
        </p>
      ) : null}

      <SettingsRow
        action={
          entitlements?.hasStripeCustomer ? (
            <SettingsPrimaryButton
              disabled={busy !== null}
              onClick={() => void redirectTo("portal", openBillingPortal)}
              type="button"
            >
              {busy === "portal" ? <Spinner className="size-3.5" /> : null}
              Manage subscription
            </SettingsPrimaryButton>
          ) : (
            <SettingsStatusBadge>{tierDisplayName(tier)}</SettingsStatusBadge>
          )
        }
        description={planDescription(entitlements)}
        title={
          entitlements?.isFoundingCreator
            ? `${tierDisplayName(tier)} plan · Founding creator`
            : `${tierDisplayName(tier)} plan`
        }
      />

      {paid && upgradeTiers.length > 0 ? (
        <p className="mt-3 text-sm leading-5 text-muted">
          Switching plans, updating your card and cancelling all happen in the
          billing portal.
        </p>
      ) : null}

      {!paid && upgradeTiers.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {upgradeTiers.map((candidate) => (
            <PlanCard
              busy={busy === candidate.key}
              catalogue={catalogue}
              disabled={busy !== null || confirming}
              key={candidate.key}
              onUpgrade={() => {
                const target = candidate.key as CheckoutTier;
                void redirectTo(target, () => startCheckout(target));
              }}
              tier={candidate}
            />
          ))}
        </div>
      ) : null}

      {!paid && upgradeTiers.length === 0 && catalogue && !catalogue.configured ? (
        <p className="mt-3 text-sm leading-5 text-muted">
          Paid plans open soon.
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function planDescription(entitlements: BillingMe["entitlements"] | null): string {
  if (!entitlements) {
    return "We couldn't load your plan right now.";
  }

  if (!entitlements.paid) {
    return "Creator-plan programmes, 90-day analytics and premium Studio lessons are one upgrade away.";
  }

  if (entitlements.status === "past_due") {
    return "There was a problem with your last payment. Update your card in the billing portal to keep your plan.";
  }

  const periodEnd = formatDate(entitlements.currentPeriodEnd);

  if (!periodEnd) {
    return "Active.";
  }

  return entitlements.cancelAtPeriodEnd
    ? `Your plan ends on ${periodEnd}. You keep everything until then.`
    : `Renews on ${periodEnd}.`;
}

function SubscriptionWelcome({
  entitlements,
  onClose,
  tier,
}: {
  entitlements: BillingMe["entitlements"];
  onClose: () => void;
  tier: PublicTier | null;
}) {
  const plan = tierDisplayName(entitlements.tier);

  return (
    <PlanningModal className="items-center gap-5 p-8 text-center" labelledBy="subscription-welcome-title" onClose={onClose}>
      <span className="grid size-14 place-items-center rounded-full bg-accent/15 text-accent">
        <PartyPopper aria-hidden className="size-7" />
      </span>
      <div>
        <h2 className="text-2xl font-bold text-foreground" id="subscription-welcome-title">
          Welcome to {plan}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          {entitlements.isFoundingCreator
            ? "Your payment is confirmed and your founding creator rate is locked in for as long as you stay subscribed."
            : "Your payment is confirmed and your new plan is active."}
        </p>
      </div>
      {tier ? (
        <ul className="flex w-full flex-col gap-2.5 rounded-2xl bg-surface p-5 text-left">
          {planFeatures(tier).map((feature) => (
            <li className="flex items-center gap-3 text-sm text-foreground" key={feature}>
              <Check aria-hidden className="size-4 flex-shrink-0 text-success" />
              {feature}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <Link
          className="inline-flex flex-1 items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          href="/programs/available"
        >
          Explore programmes
        </Link>
        <SettingsOutlineButton className="flex-1 justify-center" onClick={onClose} type="button">
          Close
        </SettingsOutlineButton>
      </div>
    </PlanningModal>
  );
}

function planFeatures(tier: PublicTier): string[] {
  const features = [
    tier.programmeSet === "full"
      ? "Every programme, including Creator-only ones"
      : "The starter programmes",
    tier.analyticsWindowsDays.includes(90)
      ? "Growth analytics with 90-day history"
      : "Growth analytics, 7 and 30 days",
  ];

  if (tier.paidLessons) {
    features.push("Premium Studio masterclasses and templates");
  }

  if (tier.earlyAccess) {
    features.push("Early access to new programmes");
  }

  return features;
}

function PlanCard({
  busy,
  catalogue,
  disabled,
  onUpgrade,
  tier,
}: {
  busy: boolean;
  catalogue: BillingCatalogue | null;
  disabled: boolean;
  onUpgrade: () => void;
  tier: PublicTier;
}) {
  const founding =
    catalogue?.offers.founding.available &&
    catalogue.offers.founding.appliesTo === tier.key
      ? catalogue.offers.founding
      : null;
  const alpha = !founding && catalogue?.offers.alpha.enabled ? catalogue.offers.alpha : null;
  const price = founding?.price ?? tier.price;
  const purchasable = tier.checkout && Boolean(catalogue?.configured);

  return (
    <div className="rounded-3xl bg-surface p-8">
      <span
        className={cn(
          "mb-4 inline-block rounded-full px-3.5 py-1 text-xs font-bold uppercase tracking-wide",
          tier.key === "pro"
            ? "bg-foreground text-background"
            : "bg-accent/15 text-accent",
        )}
      >
        {tier.displayName}
      </span>
      <p className="mb-2 text-3xl font-extrabold text-foreground">
        {tier.displayName}
      </p>
      <p className="mb-1 text-base text-muted">
        {price ? (
          <>
            <span className="font-bold text-foreground">{formatPrice(price)}</span>
            {" / "}
            {price.interval ?? "month"}
          </>
        ) : (
          "Price unavailable right now"
        )}
      </p>
      {founding ? (
        <p className="mb-5 text-sm font-semibold text-accent">
          Founding creator rate, held for as long as you stay subscribed.
        </p>
      ) : alpha ? (
        <p className="mb-5 text-sm font-semibold text-accent">
          Alpha offer: {alpha.discountPercent}% off your first{" "}
          {alpha.durationMonths} months.
        </p>
      ) : (
        <p className="mb-5 text-sm text-muted">Cancel any time.</p>
      )}
      <ul className="mb-6 flex flex-col gap-3">
        {planFeatures(tier).map((feature) => (
          <li className="flex items-center gap-3 text-sm text-foreground" key={feature}>
            <Check aria-hidden className="size-4 flex-shrink-0 text-success" />
            {feature}
          </li>
        ))}
      </ul>
      <button
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-9 py-3.5 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || !purchasable}
        onClick={onUpgrade}
        type="button"
      >
        {busy ? <Spinner className="size-4" /> : null}
        {purchasable ? `Upgrade to ${tier.displayName}` : "Coming soon"}
      </button>
    </div>
  );
}

function ReferralSection({
  referral,
}: {
  referral: BillingMe["referral"] | null;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copyLink() {
    if (!referral) {
      return;
    }

    try {
      await navigator.clipboard.writeText(referral.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Clipboard access can be refused; the link is on screen to select.
    }
  }

  return (
    <section className="mb-9">
      <SettingsSectionLabel>Referral</SettingsSectionLabel>
      <SettingsRow
        action={
          <SettingsOutlineButton
            disabled={!referral}
            onClick={() => void copyLink()}
            type="button"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </SettingsOutlineButton>
        }
        description={
          referral
            ? referral.enabled
              ? `${referral.link} - a free month for you when someone you refer subscribes.`
              : referral.link
            : "Your referral link will appear here."
        }
        title="Your referral link"
      />
      {referral ? (
        <div className="mt-3 flex gap-8 text-sm text-muted">
          <span>{referral.counts.referred} referred</span>
          <span>{referral.counts.converted} converted</span>
          <span>{referral.counts.rewarded} rewarded</span>
        </div>
      ) : null}
      {referral && !referral.enabled ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
          <Lock aria-hidden className="size-3.5" />
          Referral rewards switch on with paid plans.
        </p>
      ) : null}
    </section>
  );
}
