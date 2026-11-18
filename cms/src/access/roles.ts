import type { Access, PayloadRequest } from "payload";

/**
 * Who may change what.
 *
 * Publishing a matching setup decides which programme every future user is
 * assigned to, across the whole product, with no per-record scope to limit the
 * blast radius. "Is signed in" is not a proportionate check for that, so it is
 * its own role rather than a property of having an account.
 */
export const userRoles = ["admin", "matching-operator", "editor"] as const;

export type UserRole = (typeof userRoles)[number];

export const userRoleTokens = {
  admin: "admin",
  matchingOperator: "matching-operator",
  editor: "editor",
} as const satisfies Record<string, UserRole>;

export const roleOptions = [
  { label: "Admin", value: userRoleTokens.admin },
  { label: "Matching operator", value: userRoleTokens.matchingOperator },
  { label: "Editor", value: userRoleTokens.editor },
];

function roleOf(user: PayloadRequest["user"]): string | null {
  const role = (user as { role?: unknown } | null)?.role;
  return typeof role === "string" ? role : null;
}

export function hasRole(
  req: Pick<PayloadRequest, "user">,
  ...allowed: readonly UserRole[]
): boolean {
  const role = roleOf(req.user);
  return role !== null && allowed.includes(role as UserRole);
}

export const isAdmin: Access = ({ req }) => hasRole(req, userRoleTokens.admin);

// Admins are matching operators too. Keeping them separate would mean the
// person who grants the role cannot use it, which is a rule people work around
// rather than follow.
export const isMatchingOperator: Access = ({ req }) =>
  hasRole(req, userRoleTokens.admin, userRoleTokens.matchingOperator);

export const isSignedIn: Access = ({ req }) => Boolean(req.user);
