import "server-only";
import { createRuntime, type AppTransaction } from "./session";
import { requireUser } from "../auth/server";
import { getDatabaseEnv } from "../server-env";
const globalDb = globalThis as typeof globalThis & {
  productRuntime?: ReturnType<typeof createRuntime>;
};
/** Identity comes only from verified Supabase Auth, never a request's user/org parameters. */
export async function withDb<T>(work: (tx: AppTransaction) => Promise<T>): Promise<T> {
  const user = await requireUser();
  globalDb.productRuntime ??= createRuntime(getDatabaseEnv().DATABASE_URL);
  return globalDb.productRuntime.run(user.id, work);
}
