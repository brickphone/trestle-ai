import { describe, it, expect } from "vitest";
import { readableCase } from "./display-case";
import { sentenceDescription } from "./onboarding/model";
describe("source display casing", () => {
  it.each([
    ["C J W CONSTRUCTION, INC.", "C J W Construction, Inc."],
    ["MCLB BARSTOW", "MCLB Barstow"],
    ["B467 NASNI", "B467 NASNI"],
    ["WEST COAST BUILDING & CONSTRUCTION, INC.", "West Coast Building & Construction, Inc."],
    ["MCAS MIRAMAR LLC", "MCAS Miramar LLC"],
    ["USACE VA CONSTRUCTION, INC.", "USACE VA Construction, Inc."],
    ["SAN DIEGO", "San Diego"],
    ["O’BRIEN CONSTRUCTION LLC", "O’Brien Construction LLC"],
  ])("formats %s without altering its source", (raw, expected) => {
    expect(readableCase(raw)).toBe(expected);
    expect(raw).toBe(raw.toUpperCase());
  });
  it("keeps building identifiers and acronyms in sentence-case descriptions", () => {
    expect(sentenceDescription("IGF::OT::IGF RENOVATE B467 NASNI FOR USACE AND VA")).toBe(
      "Renovate B467 NASNI for USACE and VA",
    );
    expect(sentenceDescription("REPAIR A BUILDING")).toBe("Repair a building");
    expect(sentenceDescription("MCLB BARSTOW")).toBe("MCLB Barstow");
  });
  it("leaves mixed case, state codes, missing values and raw descriptions alone", () => {
    expect(readableCase("McCarthy Construction, Inc.")).toBe("McCarthy Construction, Inc.");
    expect(readableCase(null)).toBeNull();
    const record = {
      company: "C J W CONSTRUCTION, INC.",
      city: "MCLB BARSTOW",
      description: "B467 NASNI",
      state: "CA",
    };
    const original = { ...record };
    readableCase(record.company);
    readableCase(record.city);
    sentenceDescription(record.description);
    expect(record).toEqual(original);
    expect(record.state).toBe("CA");
  });
});
