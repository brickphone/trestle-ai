import { z } from "zod";
function isPublishableKey(value: string) {
  if (value.startsWith("sb_secret_")) return false;
  const payload = value.split(".")[1];
  if (!payload) return true;
  try {
    return (
      JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/"))).role !== "service_role"
    );
  } catch {
    return true;
  }
}
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1)
    .refine(isPublishableKey, "Use a publishable/anon key, never a secret/service-role key"),
});
export type PublicEnv = z.infer<typeof publicSchema>;
export class EnvError extends Error {
  override name = "EnvError";
}
export function parseEnv<T extends z.ZodType>(
  group: string,
  schema: T,
  source: unknown,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new EnvError(
      `Invalid ${group} environment variables:\n${issues}\nSee .env.example and README.md.`,
    );
  }
  return result.data;
}
/** Public values only. All database/API secrets are in the server-only module. */
export function getPublicEnv(): PublicEnv {
  return parseEnv("public", publicSchema, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
