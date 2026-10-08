import { readableTextColor } from "@/lib/study/groupColors";

/** Most players a battle room can hold (matches battle_rooms.max_players). */
export const MAX_BATTLE_PLAYERS = 5;

/**
 * Each player's identity colour, in join order: the four paint colours, then
 * near-black for a fifth. Used for their lobby card, progress bar and chat.
 */
const PLAYER_PAINTS = ["#027b49", "#f19ec8", "#fbb833", "#fa4d43", "#1f1f1f"] as const;

export interface PlayerColor {
  /** The paint itself. */
  paint: string;
  /** Readable text on top of the paint. */
  ink: string;
}

export function playerColor(joinIndex: number): PlayerColor {
  const paint = PLAYER_PAINTS[joinIndex % PLAYER_PAINTS.length];
  return { paint, ink: readableTextColor(paint) };
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th". */
export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}
