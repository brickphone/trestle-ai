import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { getPublicEnv } from "./env";
const original = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
});
afterEach(() => {
  if (original.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = original.url;
  if (original.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = original.key;
});
describe("public Supabase configuration", () => {
  it("needs only the URL and publishable key for normal access", () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_test";
    expect(getPublicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("sb_publishable_test");
  });
  it.each(["sb_secret_test", `header.${btoa(JSON.stringify({ role: "service_role" }))}.signature`])(
    "rejects privileged keys before they reach normal application clients",
    (key) => {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;
      expect(() => getPublicEnv()).toThrow("never a secret/service-role key");
    },
  );
});
