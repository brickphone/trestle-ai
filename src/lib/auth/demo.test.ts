import type * as Security from "../supabase/security";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  verify: vi.fn(),
  setSession: vi.fn(),
  client: vi.fn(),
  rows: {} as Record<string, unknown[]>,
}));
vi.mock("./server", () => ({ authClient: mocks.client }));
vi.mock("../env", () => ({
  getPublicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://test.example",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-public-key",
  }),
}));
vi.mock("../supabase/security", async (importOriginal) => ({
  ...(await importOriginal<typeof Security>()),
  verifyUserClient: mocks.verify,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { signInWithPassword: mocks.signIn },
    from: (table: string) => ({
      select: () => {
        const promise = Promise.resolve({ data: mocks.rows[table] ?? [], error: null });
        return Object.assign(promise, { eq: () => promise });
      },
    }),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("server-only", () => ({}));
import { viewDemo } from "./actions";
describe("one-click demo authentication boundary", () => {
  const previous = { email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEMO_EMAIL = "demo@test.example";
    process.env.DEMO_PASSWORD = "test-only";
    mocks.rows = {
      staff_users: [],
      memberships: [{ organization_id: "demo" }],
      organizations: [{ id: "demo", is_demo: true }],
    };
    mocks.verify.mockResolvedValue({
      role: "authenticated",
      user_id: "demo-user",
      rls_active: true,
    });
    mocks.signIn.mockResolvedValue({
      data: {
        user: { id: "demo-user" },
        session: { access_token: "test-only-access", refresh_token: "test-only-refresh" },
      },
      error: null,
    });
    mocks.client.mockResolvedValue({ auth: { setSession: mocks.setSession } });
    mocks.setSession.mockResolvedValue({ error: null });
  });
  afterEach(() => {
    if (previous.email === undefined) delete process.env.DEMO_EMAIL;
    else process.env.DEMO_EMAIL = previous.email;
    if (previous.password === undefined) delete process.env.DEMO_PASSWORD;
    else process.env.DEMO_PASSWORD = previous.password;
  });
  it("never installs a staff or real-account session", async () => {
    for (const rows of [
      {
        staff_users: [{ user_id: "demo-user" }],
        memberships: [{ organization_id: "demo" }],
        organizations: [{ id: "demo", is_demo: true }],
      },
      {
        staff_users: [],
        memberships: [{ organization_id: "real" }],
        organizations: [{ id: "real", is_demo: false }],
      },
    ]) {
      mocks.rows = rows;
      await expect(viewDemo()).rejects.toThrow("Demo%20configuration");
    }
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
  it("never installs cookies when the Data API RLS guard fails", async () => {
    mocks.verify.mockRejectedValue(new Error("Unsafe Supabase client"));
    await expect(viewDemo()).rejects.toThrow("Unsafe Supabase client");
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
  it("installs cookies only after validating the read-only demo organization", async () => {
    await expect(viewDemo()).rejects.toThrow("redirect:/");
    expect(mocks.setSession).toHaveBeenCalledOnce();
    expect(mocks.verify.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setSession.mock.invocationCallOrder[0]!,
    );
  });
});
