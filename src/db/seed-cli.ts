import { createDb } from "./client";
import { seedCatalog } from "./seed";

async function main() {
  const path = process.env.MIRA_DB_PATH ?? "data/mira.db";
  const db = createDb(path);
  await seedCatalog(db);
  console.log(`Seeded ${path}`);
}

void main();
