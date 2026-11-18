import { DataSource } from "typeorm";
import databaseConfig from "../../config/database.config";
import appDataSource from "../data-source";
import { assertDisposableTestDatabase } from "../test-database-guard";

/**
 * The integration suites' shared bootstrap.
 *
 * Every one of them opened the same connection the same way: guard the url,
 * clone the application options onto it, initialize, run migrations. That
 * block existed nineteen times, so a change to how the suites reach Postgres —
 * a pool setting, a new guard — had to be made nineteen times.
 *
 * `skip` is exported alongside it because the pair is what makes a suite run
 * locally and no-op in CI: `TEST_DATABASE_URL` unset means every test in the
 * file is skipped rather than failed.
 */
export const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export const skipWithoutDatabase = testDatabaseUrl
  ? false
  : "TEST_DATABASE_URL is not set";

export async function openTestDataSource(): Promise<DataSource> {
  assertDisposableTestDatabase(testDatabaseUrl, databaseConfig().database.url);

  const dataSource = new DataSource({
    ...appDataSource.options,
    url: testDatabaseUrl,
  } as typeof appDataSource.options);

  await dataSource.initialize();
  await dataSource.runMigrations();

  return dataSource;
}
