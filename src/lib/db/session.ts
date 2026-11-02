import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { z } from "zod";

/** Internal server transport, also exercised by the real database integration suite. */
export function createRuntime(connectionString: string) {
  const client = postgres(connectionString, {
    prepare: false,
    max: 5,
    connect_timeout: 10,
    idle_timeout: 20,
  });
  const db = drizzle(client);
  type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
  async function run<T>(verifiedUserId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    z.uuid().parse(verifiedUserId);
    return db.transaction(async (tx) => {
      // Fail closed even if somebody accidentally deploys an owner/service connection.
      const [login] = await tx.execute<{ safe: boolean }>(
        sql`select current_user='app_runtime' and not rolsuper and not rolbypassrls as safe from pg_roles where rolname=current_user`,
      );
      if (!login?.safe) throw new Error("Unsafe database connection: app_runtime is required");
      await tx.execute(sql`set local role app_request`);
      await tx.execute(
        sql`select set_config('request.jwt.claims',${JSON.stringify({ sub: verifiedUserId, role: "authenticated" })},true)`,
      );
      await tx.execute(sql`set local row_security=on`);
      const [guard] = await tx.execute<{ safe: boolean }>(
        sql`select current_user='app_request' and row_security_active('app.jobs'::regclass) and row_security_active('app.organizations'::regclass) as safe`,
      );
      if (!guard?.safe) throw new Error("Row level security is not active");
      return work(tx);
    });
  }
  return { run, close: () => client.end() };
}
export type AppTransaction = Parameters<Parameters<ReturnType<typeof createRuntime>["run"]>[1]>[0];
