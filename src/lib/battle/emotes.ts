/**
 * The battle emote catalogue.
 *
 * To use your own artwork, drop the image in `public/emotes/` and give the
 * emote a `src` (e.g. `src: "/emotes/fire.png"`). Square images work best --
 * they're shown cropped to a circle. Until then each emote falls back to its
 * placeholder `emoji`. Ids are what's sent between players, so keep them
 * stable once in use.
 */
export interface Emote {
  id: string;
  label: string;
  emoji: string;
  src?: string;
}

export const EMOTES: readonly Emote[] = [
  { id: "wave", label: "Wave", emoji: "👋" },
  { id: "fire", label: "On fire", emoji: "🔥" },
  { id: "laugh", label: "Laugh", emoji: "😂" },
  { id: "shock", label: "Shocked", emoji: "😱" },
  { id: "cry", label: "Crying", emoji: "😭" },
  { id: "think", label: "Thinking", emoji: "🤔" },
  { id: "flex", label: "Flex", emoji: "💪" },
  { id: "gg", label: "GG", emoji: "🤝" },
];

const byId = new Map(EMOTES.map((emote) => [emote.id, emote]));

export function findEmote(id: unknown): Emote | undefined {
  return typeof id === "string" ? byId.get(id) : undefined;
}

/** Minimum gap between one player's emotes. */
export const EMOTE_COOLDOWN_MS = 1200;
/** How long an emote stays on screen. */
export const EMOTE_LIFETIME_MS = 2800;
/** Most emotes on screen at once; older ones make way. */
export const MAX_VISIBLE_EMOTES = 12;
