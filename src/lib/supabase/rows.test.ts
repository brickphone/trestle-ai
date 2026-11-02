import { describe, it, expect, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { readAll, normalize } from "./rows";
describe("Data API row transport", () => {
  it("loads every row even when the project caps responses below the requested page size", async () => {
    const records = Array.from({ length: 605 }, (_, id) => ({
      id: String(id).padStart(4, "0"),
      amount_cents: 101,
    }));
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const query = new URL(String(input));
      const offset = Number(query.searchParams.get("offset") ?? 0);
      const limit = Math.min(100, Number(query.searchParams.get("limit") ?? 500));
      const page = records.slice(offset, offset + limit);
      return Response.json(page, {
        headers: { "content-range": `${offset}-${offset + page.length - 1}/${records.length}` },
      });
    });
    const client = createClient<Database>("https://project.test", "test-public-key", {
      auth: { persistSession: false },
      global: { fetch: fetcher },
    });
    const rows = await readAll(client, "jobs", "org");
    expect(rows).toHaveLength(605);
    expect(rows).toEqual(records);
    expect(fetcher).toHaveBeenCalledTimes(7);
    for (const call of fetcher.mock.calls)
      expect(new URL(String(call[0])).searchParams.get("organization_id")).toBe("eq.org");
  });
  it("normalizes timestamps while keeping cents, nulls and date-only fields intact", () => {
    const row = {
      created_at: "2026-01-01T12:00:00Z",
      voided_at: null,
      fetched_at: "2026-01-02T00:00:00Z",
      amount_cents: 101,
      start_date: "2026-01-01",
    };
    const result = normalize<{
      created_at: Date;
      voided_at: Date | null;
      fetched_at: Date;
      amount_cents: number;
      start_date: string;
    }>(row);
    expect(result.created_at.toISOString()).toBe("2026-01-01T12:00:00.000Z");
    expect(result.fetched_at).toBeInstanceOf(Date);
    expect(result.voided_at).toBeNull();
    expect(result.amount_cents).toBe(101);
    expect(result.start_date).toBe("2026-01-01");
    expect(row.created_at).toBe("2026-01-01T12:00:00Z");
  });
});
