import "server-only";
import { pgSchema } from "drizzle-orm/pg-core";

/** SQL migrations own DDL. Add matching Drizzle table declarations with the MVP. */
export const appSchema = pgSchema("app");
