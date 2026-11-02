import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  run: vi.fn(),
  close: vi.fn(),
  setSession: vi.fn(),
  client: vi.fn(),
}));
vi.mock("./server", () => ({ authClient: mocks.client }));
vi.mock("../env", () => ({
  getPublicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://test.example",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-public-key",
  }),
}));
vi.mock("../server-env", () => ({ getDatabaseEnv: () => ({ DATABASE_URL: "test-only" }) }));
vi.mock("../db/session", () => ({ createRuntime: () => ({ run: mocks.run, close: mocks.close }) }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithPassword: mocks.signIn } }),
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
    mocks.signIn.mockResolvedValue({
      data: {
        user: { id: "demo-user" },
        session: { access_token: "test-only-access", refresh_token: "test-only-refresh" },
      },
      error: null,
    });
    mocks.client.mockResolvedValue({ auth: { setSession: mocks.setSession } });
    mocks.setSession.mockResolvedValue({ error: null });
    mocks.close.mockResolvedValue(undefined);
  });
  afterEach(() => {
    if (previous.email === undefined) delete process.env.DEMO_EMAIL;
    else process.env.DEMO_EMAIL = previous.email;
    if (previous.password === undefined) delete process.env.DEMO_PASSWORD;
    else process.env.DEMO_PASSWORD = previous.password;
  });
  it("never installs a real/staff account session when demo identity validation fails", async () => {
    mocks.run.mockResolvedValue(false);
    await expect(viewDemo()).rejects.toThrow("Demo%20configuration");
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.setSession).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("never installs any cookies when the restricted database check fails", async () => {
    mocks.run.mockRejectedValue(new Error("Unsafe database connection"));
    await expect(viewDemo()).rejects.toThrow("Unsafe database connection");
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.setSession).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("installs cookies only after validating the read-only demo organization", async () => {
    mocks.run.mockResolvedValue(true);
    await expect(viewDemo()).rejects.toThrow("redirect:/");
    expect(mocks.setSession).toHaveBeenCalledOnce();
    expect(mocks.run.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setSession.mock.invocationCallOrder[0]!,
    );
  });
});
