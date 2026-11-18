import { connection } from "next/server";
import { AdminTeamHeader } from "@/components/admin/team/add-admin";
import { RemoveAdminButton } from "@/components/admin/team/remove-admin-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDay, formatLastActive, initials } from "@/lib/admin/admin-format";
import { getAdminServer } from "@/lib/admin/admin-session";
import { getAdminTeam } from "@/lib/admin/admin-team";
import type { AdminTeamMember } from "@/schemas/admin-team.schema";

const ago = (iso: string, now: Date) => formatLastActive({ at: iso, precision: "time" }, now);

/**
 * The inviter's display name from their email: the matching admin's name
 * while they are on the team, otherwise the address itself. The audit log
 * stores emails, so a removed inviter still reads as something.
 */
function nameFor(email: string, members: AdminTeamMember[], selfEmail: string | null) {
  if (email === selfEmail) return "You";

  return members.find((member) => member.email.toLowerCase() === email)?.name ?? email;
}

async function loadTeam() {
  const [{ members }, session] = await Promise.all([getAdminTeam(), getAdminServer()]);
  await connection();

  return {
    members,
    self: session.status === "signed-in" ? session.admin : null,
    now: new Date(),
  };
}

/**
 * Everyone with admin access, in one card. Remove is offered on every row but
 * the signed-in admin's own — the api refuses that (and removing the last
 * admin, which is always you), so the row simply has no button.
 */
export async function AdminTeamMembers() {
  const { members, self, now } = await loadTeam();
  const selfEmail = self?.email.toLowerCase() ?? null;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-background">
      <AdminTeamHeader title={`Admins · ${members.length}`} />
      <ul className="divide-y divide-border">
        {members.map((member) => (
          <li className="flex items-center gap-3 px-5 py-3.5" key={member.id}>
            <Avatar className="size-9">
              <AvatarFallback className="bg-control text-xs font-bold text-foreground">
                {initials(member.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-semibold text-foreground">
                <span className="truncate">{member.name}</span>
                {member.id === self?.id ? <Badge variant="outline">You</Badge> : null}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {member.email} · Added {formatDay(member.addedAt)}
                {member.addedBy ? ` by ${nameFor(member.addedBy, members, selfEmail)}` : ""}
              </p>
            </div>
            <span className="hidden shrink-0 text-sm text-muted-foreground sm:block">
              {member.lastSeenAt ? `Active ${ago(member.lastSeenAt, now).toLowerCase()}` : "Never signed in"}
            </span>
            <div className="flex w-20 shrink-0 justify-end">
              {member.id === self?.id ? null : (
                <RemoveAdminButton email={member.email} id={member.id} name={member.name} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AdminTeamSkeleton() {
  return (
    <div aria-hidden className="h-48 rounded-lg border border-border bg-background" data-skeleton />
  );
}
