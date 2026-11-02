import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseEnv } from "../server-env";

function connect() {
  const client = postgres(getDatabaseEnv().DATABASE_URL, {
    prepare: false, // Compatible with hosted Supabase transaction pooling too.
    max: 5,
    connect_timeout: 10,
    idle_timeout: 20,
  });
  return drizzle(client);
}

const globalDb = globalThis as typeof globalThis & { trestleDb?: ReturnType<typeof connect> };

/** Lazy connection: builds and pages without DB queries need no database secrets. */
export function getDb() {
  globalDb.trestleDb ??= connect();
  return globalDb.trestleDb;
}
