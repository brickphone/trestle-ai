import { z } from "zod";

/**
 * Environment validation.
 *
 * Variables are grouped by consumer and parsed lazily, so a page that never
 * touches SAM.gov doesn't fail because SAM_API_KEY is unset, and `next build`
 * works without a database. Each getter throws a readable error listing every
 * missing or malformed variable in its group.
 *
 * Server-only secrets (DATABASE_URL, SAM_API_KEY) must never be imported into
 * client components; `src/lib/server-env.ts` re-exports them behind
 * `server-only`.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const databaseSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((v) => /^postgres(ql)?:\/\//.test(v), "must be a postgres:// connection string"),
});

const samSchema = z.object({
  SAM_API_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type DatabaseEnv = z.infer<typeof databaseSchema>;
export type SamEnv = z.infer<typeof samSchema>;

export class EnvError extends Error {
  override name = "EnvError";
}

function parse<T extends z.ZodType>(group: string, schema: T, source: unknown): z.infer<T> {
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

export function getPublicEnv(): PublicEnv {
  // NEXT_PUBLIC_* must be referenced literally so Next.js can inline them.
  return parse("public", publicSchema, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

export function getDatabaseEnv(): DatabaseEnv {
  return parse("database", databaseSchema, process.env);
}

export function getSamEnv(): SamEnv {
  return parse("SAM.gov", samSchema, process.env);
}
