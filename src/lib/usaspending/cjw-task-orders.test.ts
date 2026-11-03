import { it, expect } from "vitest";
import { lookupUei } from ".";
import recording from "./fixtures/cjw-task-orders.json";
it("keeps award-level obligations for both CJW delivery orders, distinct from their ceilings", async () => {
  const replay: typeof fetch = async (url) => {
    const path = String(url);
    if (path.includes("autocomplete"))
      return Response.json({
        results: [{ uei: "MY4DNWXWL7M1", recipient_name: "C J W CONSTRUCTION, INC." }],
      });
    if (path.includes("spending_by_award"))
      return Response.json({
        results: recording.records.map((r) => r.searchRow),
        page_metadata: { hasNext: false },
      });
    const record = recording.records.find((r) => path.includes(r.searchRow.generated_internal_id));
    if (!record) throw Error(`Unrecorded request ${path}`);
    return Response.json(record.detail);
  };
  const found = await lookupUei("MY4DNWXWL7M1", replay, { asOfDate: "2026-11-03" });
  expect(found.kind).toBe("found");
  if (found.kind !== "found") return;
  expect(found.awards).toHaveLength(2);
  for (const [id, obligation, ceiling] of [
    ["N6247326F0157", 337700000, 337700000],
    ["N6247324F5214", 2709527200, 2712027200],
  ] as const) {
    const award = found.awards.find((a) => a.rawContractNumber === id)!;
    expect(award.isTaskOrder).toBe(true);
    expect(award.obligationsCents).toBe(obligation);
    expect(award.contractValueCents).toBe(ceiling);
    expect(award.parentAwardId).toMatch(/^N62473/);
  }
});
