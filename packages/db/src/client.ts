import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) {
    return _db;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to initialize DB client");
  }
  const pool = new Pool({ connectionString });
  _db = drizzle(pool);
  return _db;
}

