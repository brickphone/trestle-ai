/** Proposal only. These values do not change the application theme. */
export const proposal = {
  canvas: "#FCFCFA",
  surface: "#FFFFFF",
  subtle: "#F3F3EF",
  hover: "#F5F5F1",
  divider: "#DDDED8",
  control: "#81877E",
  ink: "#202720",
  secondary: "#50594F",
  tertiary: "#687064",
  positive: "#346346",
  negative: "#A13E36",
  warning: "#805B22",
  green: "#151515",
  greenHover: "#30302E",
  blue: "#30302E",
  blueHover: "#111111",
} as const;

export function contrast(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const [r = 0, g = 0, b = 0] = hex.match(/[\da-f]{2}/gi)!.map((part) => {
      const channel = parseInt(part, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = luminance(foreground),
    b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
