import { properties } from "./schema";
import { createDb, getDb, resetDbSingleton, type MiraDb } from "./client";
import { seedCatalog } from "./seed";

export async function ensureCatalog(db: MiraDb): Promise<MiraDb> {
  const rows = await db.select().from(properties);
  if (rows.length === 0) {
    await seedCatalog(db);
  }
  return db;
}

export async function readyDb(): Promise<MiraDb> {
  return ensureCatalog(getDb());
}

export { createDb, getDb, resetDbSingleton };
