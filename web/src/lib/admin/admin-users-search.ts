// The user list's URL state. Dependency-free so the client search box, the
// server page and the tests all share one definition.

export interface AdminUsersSearch {
  q: string;
  page: number;
}

/** The list's URL state, read leniently: junk in the URL means defaults. */
export function parseAdminUsersSearch(
  params: Record<string, string | string[] | undefined>,
): AdminUsersSearch {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const page = Number(first(params.page));

  return {
    q: (first(params.q) ?? "").trim().slice(0, 100),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** `/admin/users` with the given state, omitting defaults so URLs stay short. */
export function adminUsersHref({ q, page }: Partial<AdminUsersSearch>) {
  const params = new URLSearchParams();

  if (q) params.set("q", q);
  if (page && page > 1) params.set("page", String(page));

  const query = params.toString();
  return query ? `/admin/users?${query}` : "/admin/users";
}

/**
 * Where a user view's "Back to users" goes: the list URL the row was opened
 * from, so the search and page survive. Only an /admin/users URL is accepted,
 * so the parameter can never send the team member somewhere else.
 */
export function backToUsersHref(from: string | string[] | undefined) {
  const value = Array.isArray(from) ? from[0] : from;

  return value && /^\/admin\/users(\?|$)/.test(value) ? value : "/admin/users";
}

/**
 * The user view's back link. A user opened from Engine activity goes back
 * there, filters kept; anything else goes back to the user list.
 */
export function userBackLink(from: string | string[] | undefined): { href: string; label: string } {
  const value = Array.isArray(from) ? from[0] : from;

  if (value && /^\/admin\/engine-activity(\?|$)/.test(value)) {
    return { href: value, label: "Engine activity" };
  }

  return { href: backToUsersHref(from), label: "Users" };
}
