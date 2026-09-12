import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { schema, SCHEMA_SQL } from "./schema";

export type MiraDb = ReturnType<typeof drizzle<typeof schema>>;

export function openSqlite(path: string): Database.Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(SCHEMA_SQL);
  try {
    sqlite.exec(
      "ALTER TABLE booking_holds ADD COLUMN status TEXT NOT NULL DEFAULT 'held'",
    );
  } catch {
    // Column already exists on databases created with the current schema.
  }
  return sqlite;
}

export function createDb(path: string): MiraDb {
  return drizzle({ client: openSqlite(path), schema });
}

const defaultPath = process.env.MIRA_DB_PATH ?? "data/mira.db";

let singleton: MiraDb | undefined;

export function getDb(): MiraDb {
  singleton ??= createDb(defaultPath);
  return singleton;
}

export function resetDbSingleton(): void {
  singleton = undefined;
}
