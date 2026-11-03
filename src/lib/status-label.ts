export function statusLabel(value: string) {
  const text = value.replaceAll("_", " ");
  return value === "complete"
    ? "Completed"
    : text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}
