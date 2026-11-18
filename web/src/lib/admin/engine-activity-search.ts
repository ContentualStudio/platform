// The engine-activity page's URL state. Dependency-free so the client filter
// controls, the server page and the tests all share one definition.

export interface FiringFilters {
  ruleId: string | null;
  eventName: string | null;
}

/** The firing-log filters, read leniently: a blank value means no filter. */
export function parseEngineActivitySearch(
  params: Record<string, string | string[] | undefined>,
): FiringFilters {
  const first = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value)?.trim() || null;

  return { ruleId: first(params.rule), eventName: first(params.event) };
}

/** `?rule=…&event=…`, or "" when nothing is filtered. */
export function engineActivityQuery({ ruleId, eventName }: Partial<FiringFilters>) {
  const params = new URLSearchParams();

  if (ruleId) params.set("rule", ruleId);
  if (eventName) params.set("event", eventName);

  const query = params.toString();
  return query ? `?${query}` : "";
}

/** `/admin/engine-activity` with the given filters, omitting empty ones. */
export function engineActivityHref(filters: Partial<FiringFilters>) {
  return `/admin/engine-activity${engineActivityQuery(filters)}`;
}
