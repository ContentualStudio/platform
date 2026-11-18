import "reflect-metadata";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { DataSource } from "typeorm";
import databaseConfig from "../config/database.config";

function loadEnvFile(fileName: string) {
  const filePath = resolve(process.cwd(), fileName);

  if (!existsSync(filePath)) {
    return;
  }

  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    process.env[key] ??= value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const { database } = databaseConfig();

// Deploys run migrations from the compiled build, where dev dependencies such
// as ts-node are not installed. Resolve globs relative to this file so the same
// data source works both from src via ts-node and from dist via plain node.
const extension = __filename.endsWith(".js") ? "js" : "ts";

const dataSource = new DataSource({
  type: "postgres",
  url: database.url,
  ssl: database.ssl ? { rejectUnauthorized: false } : false,
  entities: [resolve(__dirname, `../**/*.entity.${extension}`)],
  migrations: [resolve(__dirname, `migrations/*.${extension}`)],
  logging: database.logging,
});

export default dataSource;
