import {
  userAttributeFields,
  userAttributeNames,
  type UserAttributeName,
} from "./catalogue.js";

export interface UserAttributeValueByName {
  readonly subscription_status: string | null;
  readonly subscription_tier: string | null;
  readonly user_type: string | null;
  readonly experience_level: string | null;
  readonly is_founding_creator: boolean | null;
  readonly lifetime_task_completions: number | null;
  readonly programmes_completed: number | null;
}

/**
 * The only data-access capability exposed to vocabulary resolvers. The API
 * evaluator supplies an implementation backed by its app-Postgres connection;
 * the shared package never imports an ORM or a network client.
 */
export interface AppPostgresUserAttributeReader {
  read<Name extends UserAttributeName>(
    userId: string,
    attribute: Name,
  ): Promise<UserAttributeValueByName[Name]>;
}

export interface UserAttributeDefinition<Name extends UserAttributeName> {
  readonly type: (typeof userAttributeFields)[Name]["type"];
  readonly resolve: (
    reader: AppPostgresUserAttributeReader,
    userId: string,
  ) => Promise<UserAttributeValueByName[Name]>;
}

type UserAttributeDefinitions = {
  readonly [Name in UserAttributeName]: UserAttributeDefinition<Name>;
};

export const userAttributeDefinitions = Object.fromEntries(
  userAttributeNames.map((name) => [
    name,
    {
      type: userAttributeFields[name].type,
      resolve: (reader: AppPostgresUserAttributeReader, userId: string) =>
        reader.read(userId, name),
    },
  ]),
) as UserAttributeDefinitions;

export function resolveUserAttribute<Name extends UserAttributeName>(
  name: Name,
  userId: string,
  reader: AppPostgresUserAttributeReader,
): Promise<UserAttributeValueByName[Name]> {
  return userAttributeDefinitions[name].resolve(reader, userId);
}
