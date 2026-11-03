import { connection } from "next/server";
import { execFileSync } from "node:child_process";
/** Public build metadata only; never returns account, database or environment secrets. */
export async function GET() {
  await connection();
  let revision = process.env.APP_REVISION ?? null,
    uncommitted: boolean | null = null;
  if (process.env.NODE_ENV === "development")
    try {
      revision = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
        encoding: "utf8",
        timeout: 1000,
      }).trim();
      uncommitted =
        execFileSync("git", ["status", "--porcelain"], { encoding: "utf8", timeout: 1000 }).trim()
          .length > 0;
    } catch {}
  return Response.json(
    {
      environment: process.env.NODE_ENV,
      revision,
      uncommitted,
      features: [
        "confirm-billed-estimate",
        "full-year-dates",
        "separate-add-job",
        "government-retainage-zero",
      ],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
