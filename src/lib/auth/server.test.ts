import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ connection: vi.fn(), cookies: vi.fn(), createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createClient }));
vi.mock("../env", () => ({
  getPublicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://project.test",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-public-key",
  }),
}));
import { authClient } from "./server";
describe("request-bound Supabase session client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({ getAll: () => [] });
    mocks.createClient.mockReturnValue({ auth: {} });
  });
  it("does not construct the SDK or check its clock until a real request is available", async () => {
    let connected!: () => void;
    mocks.connection.mockReturnValue(
      new Promise<void>((resolve) => {
        connected = resolve;
      }),
    );
    const pending = authClient();
    await Promise.resolve();
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
    connected();
    await pending;
    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createClient.mock.invocationCallOrder[0]!,
    );
  });
});
