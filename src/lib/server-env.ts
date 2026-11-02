import "server-only";
import { z } from "zod";
import { parseEnv } from "./env";
const samSchema = z.object({ SAM_API_KEY: z.string().min(1) });
export type SamEnv = z.infer<typeof samSchema>;
// Retained for the paused Internal enrichment tool, never required by the MVP.
export const getSamEnv = (): SamEnv => parseEnv("SAM.gov", samSchema, process.env);
