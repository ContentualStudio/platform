export interface ProgrammeOption {
  id: string;
  key: string;
  title: string;
}

type ProgrammeFetcher = (url: string) => Promise<Response>;

export function programmeOption(value: unknown): ProgrammeOption | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id =
    typeof record.id === "string" || typeof record.id === "number"
      ? String(record.id)
      : "";
  const key =
    typeof record.key === "string"
      ? record.key
      : typeof record.slug === "string"
        ? record.slug
        : "";

  return id && key && typeof record.title === "string"
    ? { id, key, title: record.title }
    : null;
}

export async function loadPublishedProgrammeOptions(
  fetcher: ProgrammeFetcher = (url) => fetch(url),
): Promise<ProgrammeOption[]> {
  const options: ProgrammeOption[] = [];
  let page = 1;

  while (true) {
    const query = new URLSearchParams({
      depth: "0",
      limit: "100",
      page: String(page),
      sort: "title",
      "where[_status][equals]": "published",
      "where[lifecycleStatus][equals]": "live",
    });
    const response = await fetcher(`/api/programmes?${query}`);

    if (!response.ok) {
      throw new Error("programme request failed");
    }

    const result = (await response.json()) as {
      docs?: unknown[];
      hasNextPage?: boolean;
      nextPage?: number | null;
    };
    options.push(
      ...(result.docs ?? [])
        .map(programmeOption)
        .filter((option): option is ProgrammeOption => option !== null),
    );

    if (!result.hasNextPage) {
      return options;
    }

    if (typeof result.nextPage !== "number" || result.nextPage <= page) {
      throw new Error("programme pagination did not advance");
    }
    page = result.nextPage;
  }
}
