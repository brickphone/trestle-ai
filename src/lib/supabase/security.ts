import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
/** Uses the actual Data API role. A service-role/owner client must fail here. */
export async function verifyUserClient(client: SupabaseClient<Database>, expectedUserId?: string) {
  const { data, error } = await client.rpc("request_security_context");
  if (error) throw error;
  if (
    data?.role !== "authenticated" ||
    !data.rls_active ||
    !data.user_id ||
    (expectedUserId && data.user_id !== expectedUserId)
  )
    throw new Error("Unsafe Supabase client: an authenticated user with active RLS is required");
  return data;
}
export function unwrap<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error;
  if (result.data === null || result.data === undefined) throw new Error("Record not available");
  return result.data as NonNullable<T>;
}
