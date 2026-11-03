import { it, expect } from "vitest";
import { spacedYTicks, spacedXDays } from "./chart-ticks";
it("drops colliding y labels while preserving zero even near an extreme or midpoint", () => {
  for (const domain of [
    { min: -10, max: 1000, showZero: true },
    { min: -1000, max: 10, showZero: true },
    { min: -1000, max: 1000, showZero: true },
  ]) {
    const ticks = spacedYTicks(domain);
    expect(ticks).toContain(0);
    for (let i = 1; i < ticks.length; i++)
      expect(
        ((ticks[i - 1]! - ticks[i]!) / (domain.max - domain.min)) * 160,
      ).toBeGreaterThanOrEqual(28);
  }
});
it("reduces x ticks at narrow widths with consistent pixel spacing", () => {
  for (const width of [120, 180, 220, 300, 1000]) {
    const days = spacedXDays(91, width);
    expect(days[0]).toBe(0);
    if(days.length>1)expect(days.at(-1)).toBe(90);
    for (let i = 1; i < days.length; i++)
      expect(((days[i]! - days[i - 1]!) / 90) * width).toBeGreaterThanOrEqual(70);
  }
});
