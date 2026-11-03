/** Presentation only: never use these values for persistence, IDs, or source snapshots. */
const acronyms = new Set([
  "LLC",
  "LLP",
  "LP",
  "JV",
  "USA",
  "US",
  "VA",
  "USACE",
  "MCAS",
  "MCLB",
  "MCB",
  "NAS",
  "NASNI",
  "NAVFAC",
  "USAF",
  "USN",
  "USMC",
  "NASA",
  "DOD",
  "GSA",
  "EPA",
  "FAA",
  "FEMA",
  "HVAC",
  "IT",
  "IDIQ",
  "UEI",
  "FPDS",
  "SAM",
  "QC",
  "QA",
]);
const suffixes: Record<string, string> = { INC: "Inc", CORP: "Corp", LTD: "Ltd", CO: "Co" };
export function readableCase(
  value: string | null | undefined,
  style: "name" | "sentence" = "name",
) {
  if (value == null) return null;
  // Respect user edits and source casing that is already mixed case.
  if (!/[A-Z]/.test(value) || value !== value.toUpperCase()) return value;
  let wordIndex = 0;
  let installationName = false;
  return value.replace(/[A-Z0-9]+(?:['’][A-Z]+)?/g, (word) => {
    const first = wordIndex++ === 0;
    const afterInstallation = installationName;
    installationName = /^(MCAS|MCLB|MCB|NAS)$/.test(word);
    if (
      acronyms.has(word) ||
      /\d/.test(word) ||
      (word.length === 1 && (style === "name" || word === "I"))
    )
      return word;
    if (suffixes[word]) return suffixes[word];
    const lower = word.toLowerCase();
    const name = lower.replace(
      /^([od])(['’])([a-z])/,
      (_, first, mark, letter) => first.toUpperCase() + mark + letter.toUpperCase(),
    );
    return style === "name" || first || afterInstallation
      ? name[0]!.toUpperCase() + name.slice(1)
      : lower;
  });
}
