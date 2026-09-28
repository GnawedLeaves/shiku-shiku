// Preset palette offered when tagging a group with a colour. These are the
// four paint colours of the design system -- identity blocks, not statuses.
// Users can still pick any custom colour via a native color input.

export const GROUP_COLOR_PRESETS = [
  { name: "Green", value: "#027b49" },
  { name: "Pink", value: "#f19ec8" },
  { name: "Yellow", value: "#fbb833" },
  { name: "Red", value: "#fa4d43" },
  { name: "Iron", value: "#1f1f1f" },
] as const;

/** Stable paint colour for an entity with no colour of its own (e.g. a set). */
export function paintColorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return GROUP_COLOR_PRESETS[Math.abs(hash) % 4].value;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidGroupColor(value: string): boolean {
  return HEX_RE.test(value);
}

/** Picks readable text (near-black or near-white) for a given background hex. */
export function readableTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Standard relative-luminance approximation.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1f1f1f" : "#ffffff";
}
