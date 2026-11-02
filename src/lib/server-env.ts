import "server-only";
import { z } from "zod";
import { parseEnv } from "./env";
const databaseSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((v) => /^postgres(ql)?:\/\//.test(v), "must be a postgres:// connection string"),
});
const samSchema = z.object({ SAM_API_KEY: z.string().min(1) });
export type DatabaseEnv = z.infer<typeof databaseSchema>;
export type SamEnv = z.infer<typeof samSchema>;
export const getDatabaseEnv = (): DatabaseEnv => parseEnv("database", databaseSchema, process.env);
// Retained for the paused Internal enrichment tool, never required by the MVP.
export const getSamEnv = (): SamEnv => parseEnv("SAM.gov", samSchema, process.env);
