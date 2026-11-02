import { describe, it, expect, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database, SecurityContext } from "./database.types";
import { verifyUserClient } from "./security";
const uid = "06a02f6b-7145-4e33-84fe-a54762149800";
function client(context: SecurityContext) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(context));
  return {
    client: createClient<Database>("https://project.test", "test-public-key", {
      auth: { persistSession: false },
      global: { fetch: fetcher },
    }),
    fetcher,
  };
}
describe("user-token Data API security guard", () => {
  it("accepts only the expected authenticated identity with active RLS", async () => {
    const c = client({ role: "authenticated", user_id: uid, rls_active: true });
    expect(await verifyUserClient(c.client, uid)).toEqual({
      role: "authenticated",
      user_id: uid,
      rls_active: true,
    });
    expect(String(c.fetcher.mock.calls[0]?.[0])).toContain("/rest/v1/rpc/request_security_context");
  });
  it.each([
    { role: "service_role", user_id: uid, rls_active: false },
    { role: "postgres", user_id: uid, rls_active: false },
    { role: "authenticated", user_id: uid, rls_active: false },
    { role: "authenticated", user_id: null, rls_active: true },
  ])("rejects bypass, missing identity, or disabled RLS: %j", async (context) => {
    await expect(verifyUserClient(client(context).client)).rejects.toThrow(
      "Unsafe Supabase client",
    );
  });
  it("rejects a different user even with otherwise valid authentication", async () => {
    await expect(
      verifyUserClient(
        client({ role: "authenticated", user_id: uid, rls_active: true }).client,
        "different-user",
      ),
    ).rejects.toThrow("Unsafe Supabase client");
  });
});
