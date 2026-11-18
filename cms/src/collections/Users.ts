import type { CollectionConfig } from "payload";
import { hasRole, isAdmin, roleOptions, userRoleTokens } from "../access/roles";

export const Users: CollectionConfig = {
  slug: "users",
  auth: true,
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "name", "role"],
  },
  access: {
    // Only an admin hands out roles. Without this, any account could grant
    // itself the one that publishes matching rules, and the whole distinction
    // would be decorative.
    create: isAdmin,
    delete: isAdmin,
    // An admin edits anyone; everyone else edits only their own account.
    update: ({ req }) =>
      hasRole(req, userRoleTokens.admin) ? true : { id: { equals: req.user?.id } },
  },
  fields: [
    {
      name: "name",
      type: "text",
    },
    {
      name: "role",
      type: "select",
      required: true,
      // The safe default. A new account can read and draft; publishing
      // matching rules is a deliberate grant, not what you get by signing up.
      defaultValue: userRoleTokens.editor,
      options: roleOptions,
      access: {
        // Field-level access returns a plain boolean, not a Where.
        update: ({ req }) => hasRole(req, userRoleTokens.admin),
      },
      admin: {
        description:
          "Matching operators may publish and restore programme matching rules. Editors may author drafts only.",
      },
    },
  ],
};
