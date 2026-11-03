import { describe, it, expect, vi } from "vitest";
import { lookupUei } from ".";
import fixture from "./fixtures/found.json";
describe("USAspending on-demand adapter", () => {
  it("confirms exact UEI and keeps obligations separate from contract value", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(fixture.recipient))
      .mockResolvedValueOnce(Response.json(fixture.search))
      .mockResolvedValueOnce(Response.json(fixture.award));
    const result = await lookupUei("JTAPCFM4NSL4", mock, { includeOlder: true });
    expect(result.kind).toBe("found");
    if (result.kind === "found") {
      expect(result.awards[0]?.contractValueCents).toBe(6124134);
      expect(result.awards[0]?.obligationsCents).toBe(5000000);
      expect(result.awards[0]?.sourceUrl).toContain("usaspending.gov/award/");
    }
    expect(mock).toHaveBeenCalledTimes(3);
  });
  it("returns a manual path when not found", async () => {
    const mock = vi.fn().mockResolvedValue(Response.json({ results: [] }));
    expect((await lookupUei("JTAPCFM4NSL4", mock, { includeOlder: true })).kind).toBe("not-found");
  });
  it("returns a manual path for HTTP, network and malformed-response failures", async () => {
    for (const mock of [
      vi.fn().mockResolvedValue(new Response("", { status: 503 })),
      vi.fn().mockRejectedValue(new Error("network")),
      vi.fn().mockResolvedValue(Response.json({ invalid: true })),
    ])
      expect((await lookupUei("JTAPCFM4NSL4", mock, { includeOlder: true })).kind).toBe("error");
  });
  it("never falls back from absent contract value to obligations", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(fixture.recipient))
      .mockResolvedValueOnce(Response.json(fixture.search))
      .mockResolvedValueOnce(Response.json({ ...fixture.award, base_exercised_options: null }));
    const result = await lookupUei("JTAPCFM4NSL4", mock, { includeOlder: true });
    if (result.kind !== "found") throw new Error("Lookup failed");
    expect(result.awards[0]?.contractValueCents).toBeNull();
  });
  it("rejects fuzzy award matches belonging to another UEI", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(fixture.recipient))
      .mockResolvedValueOnce(Response.json(fixture.search))
      .mockResolvedValueOnce(
        Response.json({ ...fixture.award, recipient: { recipient_uei: "DIFFERENTUEI" } }),
      );
    const result = await lookupUei("JTAPCFM4NSL4", mock, { includeOlder: true });
    expect(result.kind === "found" && result.awards.length).toBe(0);
  });
});
