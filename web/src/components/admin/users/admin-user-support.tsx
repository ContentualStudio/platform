import { EmptyLine, Panel } from "@/components/admin/panel";
import { SupportActionButton } from "@/components/admin/users/support-action-button";
import { formatDay } from "@/lib/admin/admin-format";
import { getAdminUser, getAdminUserSupport } from "@/lib/admin/admin-user-detail";
import type {
  SupportActionKey,
  SupportLogEntry,
  SupportOverview,
} from "@/schemas/admin-support.schema";

type IdParams = Promise<{ id: string }>;

export const SUPPORT_PANEL_ID = "support-actions";

const actionLabels: Record<SupportActionKey, { label: string; summary: string; logged: string }> = {
  grant_founding: {
    label: "Grant",
    summary: "Grant founding-creator status",
    logged: "Granted founding-creator status",
  },
  unflag_founding: {
    label: "Remove",
    summary: "Remove founding-creator status",
    logged: "Removed founding-creator status",
  },
  release_programme: {
    label: "Release",
    summary: "Release a stalled programme",
    logged: "Released a stalled programme",
  },
};

/**
 * The single-user view's support panel: the closed set of manual fixes, each
 * enabled only when it applies, and the user's append-only support log.
 */
export async function AdminUserSupport({ params }: { params: IdParams }) {
  const { id } = await params;
  const [user, support] = await Promise.all([getAdminUser(id), getAdminUserSupport(id)]);
  const name = user.name || user.email;

  return (
    <Panel id={SUPPORT_PANEL_ID} title="Support actions">
      <div className="flex flex-col gap-5">
        <ul className="divide-y divide-border">
          {support.actions.map((state) => {
            const copy = actionLabels[state.key];
            const confirm = confirmation(state.key, name, support);

            return (
              <li className="flex items-center justify-between gap-4 py-3 first:pt-0" key={state.key}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{copy.summary}</p>
                  <p className="text-sm text-muted-foreground">
                    {state.status === "available" ? confirm.hint : state.reason}
                  </p>
                </div>
                <SupportActionButton
                  action={state.key}
                  description={confirm.description}
                  disabled={state.status !== "available"}
                  label={copy.label}
                  title={confirm.title}
                  userId={id}
                />
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            History
          </h3>
          {support.log.length === 0 ? (
            <EmptyLine>No support actions taken.</EmptyLine>
          ) : (
            <ul className="divide-y divide-border">
              {support.log.map((entry) => (
                <SupportLogItem entry={entry} key={entry.id} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}

function SupportLogItem({ entry }: { entry: SupportLogEntry }) {
  const change = changeSummary(entry);

  return (
    <li className="flex flex-col gap-1 py-3">
      <p className="text-sm font-semibold text-foreground">{actionLabels[entry.action].logged}</p>
      <p className="text-sm text-foreground">&ldquo;{entry.reason}&rdquo;</p>
      <p className="text-xs text-muted-foreground">
        {entry.actorEmail} · {formatDay(entry.createdAt)}
        {change ? ` · ${change}` : ""}
      </p>
    </li>
  );
}

function confirmation(action: SupportActionKey, name: string, support: SupportOverview) {
  switch (action) {
    case "grant_founding":
      return {
        hint: "Not a founding creator.",
        title: `Make ${name} a founding creator?`,
        description:
          "They'll be flagged as a founding creator. A founding seat is taken if one is free, and the flag is set either way. Nothing changes in Stripe.",
      };
    case "unflag_founding":
      return {
        hint: "Currently a founding creator.",
        title: `Remove ${name}'s founding-creator status?`,
        description:
          "Their founding flag and locked founding price are cleared. Their cohort seat is not handed back. Nothing changes in Stripe.",
      };
    case "release_programme": {
      const programme = support.activeProgramme;
      const ended = programme ? formatDay(programme.lastDay) : "";

      return {
        hint: programme ? `${programme.programmeSlug} ended ${ended} but is still active.` : "",
        title: "Release this programme?",
        description: programme
          ? `${programme.programmeSlug} ended on ${ended} but never closed, so ${name} can't start another. It will be closed as left, not finished: no completion, badges or notifications are created.`
          : "",
      };
    }
  }
}

function changeSummary(entry: SupportLogEntry) {
  if (entry.action === "release_programme" && typeof entry.detail.programmeSlug === "string") {
    return entry.detail.programmeSlug;
  }

  if (entry.action === "grant_founding" && entry.detail.seatClaimed === false) {
    return "no seat was free";
  }

  return "";
}
