/**
 * DEVELOPMENT-ONLY synthetic rows for the component reference page and
 * table performance checks. Names are prefixed "Synthetic" and UEIs start with
 * "SYN" so they can never be mistaken for real firms. Never import this from
 * production pages or ingestion code.
 */

export type SyntheticRow = {
  uei: string;
  name: string;
  state: string;
  naics: string;
  obligated12m: number;
  awardCount: number;
  score: number;
  firstAward: string;
  excluded: boolean;
};

const STATES = ["CA", "TX", "VA", "FL", "WA", "AZ", "CO", "OH"];
const NAICS = ["236220", "236210", "237310", "237990", "238210", "332710", "334511", "336413"];

/** Deterministic PRNG so renders are stable across server/client and runs. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function syntheticRows(count: number, seed = 42): SyntheticRow[] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(4, "0");
    const year = 2012 + Math.floor(rand() * 13);
    const month = String(1 + Math.floor(rand() * 12)).padStart(2, "0");
    return {
      uei: `SYN${String(i + 1).padStart(9, "0")}`,
      name: `Synthetic Firm ${n}`,
      state: STATES[Math.floor(rand() * STATES.length)] ?? "CA",
      naics: NAICS[Math.floor(rand() * NAICS.length)] ?? "236220",
      obligated12m: Math.round(Math.exp(11 + rand() * 6)),
      awardCount: 1 + Math.floor(rand() * 60),
      score: Math.round(rand() * 100),
      firstAward: `${year}-${month}-01`,
      excluded: rand() < 0.01,
    };
  });
}
