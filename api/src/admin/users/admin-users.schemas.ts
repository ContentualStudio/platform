import { z } from "zod";

export const ADMIN_USERS_PAGE_SIZES = [25, 50, 100] as const;

// Query strings arrive as strings; an empty `q` is "no search", not a search
// for the empty string.
export const adminUsersQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => (value ? value : undefined)),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((value) => (ADMIN_USERS_PAGE_SIZES as readonly number[]).includes(value), {
      message: `pageSize must be one of ${ADMIN_USERS_PAGE_SIZES.join(", ")}.`,
    })
    .default(25),
});

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

/** A `LIKE` pattern matching `term` anywhere, with its wildcards neutralised. */
export function containsPattern(term: string): string {
  return `%${term.toLowerCase().replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}
