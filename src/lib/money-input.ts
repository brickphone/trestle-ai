/** USD editing syntax: commas separate thousands; a dot separates cents. */
export function ungroupMoneyInput(value: string) {
  return value
    .trim()
    .replace(/^\$\s*/, "")
    .replaceAll(",", "");
}
export function formatMoneyInput(value: string) {
  const raw = ungroupMoneyInput(value);
  if (!/^-?\d*(?:\.\d{0,2})?$/.test(raw)) return raw;
  const [whole, decimal] = raw.split(".");
  return (
    whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (decimal === undefined ? "" : `.${decimal}`)
  );
}
/** Retain the logical digit position when inserting/removing grouping commas. */
export function moneyInputCaret(text: string, position: number, formatted: string) {
  const count = ungroupMoneyInput(text.slice(0, position)).length;
  let seen = 0,
    index = 0;
  while (index < formatted.length && seen < count) {
    if (formatted[index] !== ",") seen++;
    index++;
  }
  return index;
}
