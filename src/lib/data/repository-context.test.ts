import { beforeEach, describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({ user: "member" }));
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("../auth/server", () => ({ requireUser: async () => ({ id: state.user }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("../supabase/server", () => ({ userDataClient: async () => ({}) }));
vi.mock("../supabase/rows", () => ({
  normalize: (value: unknown) => value,
  readAll: async (_: unknown, table: string) =>
    table === "staff_users"
      ? []
      : table === "organizations"
        ? [{ id: "org", name: "Company", is_demo: false, created_at: new Date("2026-01-01") }]
        : [
            { organization_id: "org", user_id: "owner", role: "owner" },
            { organization_id: "org", user_id: "member", role: "member" },
          ],
}));
import { context } from "./repository";
beforeEach(() => {
  state.user = "member";
});
describe("company owner identity", () => {
  it("does not treat a visible owner's membership as the current member's role", async () => {
    expect((await context()).isOwner).toBe(false);
  });
  it("recognizes the verified user's own owner membership", async () => {
    state.user = "owner";
    expect((await context()).isOwner).toBe(true);
  });
});
