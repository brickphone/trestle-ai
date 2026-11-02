import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiRow, Database, TableName } from "./database.types";
import { unwrap } from "./security";
function timestamp(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid database timestamp");
  return date;
}
export function normalize<T extends object>(row: ApiRow<T>): T {
  const normalized = { ...row } as Record<string, unknown>;
  for (const field of ["created_at", "voided_at", "fetched_at"])
    if (typeof normalized[field] === "string")
      normalized[field] = timestamp(normalized[field] as string);
  return normalized as T;
}
/** Page explicitly so Supabase's row cap cannot silently truncate forecasts or balances. */
export async function readAll(
  client: SupabaseClient<Database>,
  table: TableName,
  organizationId?: string,
) {
  const rows: unknown[] = [];
  const pageSize = 500;
  for (let offset = 0; ;) {
    let query = client
      .from(table)
      .select("*", { count: "exact" })
      .order(table === "staff_users" ? "user_id" : "id")
      .range(offset, offset + pageSize - 1);
    if (organizationId) query = query.filter("organization_id", "eq", organizationId);
    const response = await query;
    const page = unwrap(response);
    rows.push(...page);
    if (response.count !== null) {
      if (rows.length >= response.count) break;
      if (page.length === 0)
        throw new Error("Database pagination stopped before all rows were returned");
    } else if (page.length < pageSize) break;
    offset += page.length;
  }
  return rows;
}
