/** Pixel spacing is independent of SVG scaling. Prefer the zero reference over a nearby tick. */
export function spacedYTicks(
  domain: { min: number; max: number; showZero: boolean },
  height = 160,
  gap = 28,
) {
  const y = (v: number) => ((domain.max - v) / (domain.max - domain.min)) * height;
  const candidates = [
    ...(domain.showZero ? [0] : []),
    domain.max,
    domain.min,
    (domain.max + domain.min) / 2,
  ];
  const selected: number[] = [];
  for (const value of candidates)
    if (!selected.some((v) => Math.abs(y(v) - y(value)) < gap)) selected.push(value);
  return selected.sort((a, b) => b - a);
}
export function spacedXDays(days: number, width: number) {
  const count = (width<200?1:Math.max(2, Math.min(4, Math.floor(width / 150) + 1)));
  return Array.from({ length: count }, (_, i) => count===1?0:Math.round((i * (days - 1)) / (count - 1)));
}
