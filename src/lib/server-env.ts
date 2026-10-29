import "server-only";

// Importing this from a client component fails the build, which keeps
// DATABASE_URL and SAM_API_KEY out of browser bundles.
export { getDatabaseEnv, getSamEnv } from "./env";
