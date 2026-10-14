// Number listening: readings, answer checking and the number sequence.

/** Largest number the game deals in (matches battle_rooms_numbers_check). */
export const MAX_NUMBER = 999_999_999;

const ONES = ["", "いち", "に", "さん", "よん", "ご", "ろく", "なな", "はち", "きゅう"];
const TENS = [
  "",
  "じゅう",
  "にじゅう",
  "さんじゅう",
  "よんじゅう",
  "ごじゅう",
  "ろくじゅう",
  "ななじゅう",
  "はちじゅう",
  "きゅうじゅう",
];
// The sound changes: さんびゃく, ろっぴゃく, はっぴゃく, さんぜん, はっせん.
const HUNDREDS = [
  "",
  "ひゃく",
  "にひゃく",
  "さんびゃく",
  "よんひゃく",
  "ごひゃく",
  "ろっぴゃく",
  "ななひゃく",
  "はっぴゃく",
  "きゅうひゃく",
];
const THOUSANDS = [
  "",
  "せん",
  "にせん",
  "さんぜん",
  "よんせん",
  "ごせん",
  "ろくせん",
  "ななせん",
  "はっせん",
  "きゅうせん",
];
/** Japanese counts in groups of four digits: 万 (10⁴), 億 (10⁸). */
const UNITS = ["", "まん", "おく"];

/**
 * 0-9999. An exact thousand right before 万/億 is いっせん (1000万 =
 * いっせんまん), but 1234万 is せんにひゃく…まん.
 */
function underTenThousand(n: number, beforeUnit: boolean): string {
  const thousands = Math.floor(n / 1000);
  const hundreds = Math.floor(n / 100) % 10;
  const tens = Math.floor(n / 10) % 10;
  const ones = n % 10;
  return (
    (n === 1000 && beforeUnit ? "いっせん" : THOUSANDS[thousands]) +
    HUNDREDS[hundreds] +
    TENS[tens] +
    ONES[ones]
  );
}

/** 102 -> "ひゃくに", 10000 -> "いちまん", 0 -> "ぜろ". */
export function numberToHiragana(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > MAX_NUMBER) return String(n);
  if (n === 0) return "ぜろ";

  let reading = "";
  let rest = n;
  for (let unit = 0; rest > 0; unit++) {
    const group = rest % 10000;
    rest = Math.floor(rest / 10000);
    if (group === 0) continue;
    // A bare 万/億 still takes いち: いちまん, いちおく.
    reading = underTenThousand(group, unit > 0) + UNITS[unit] + reading;
  }
  return reading;
}

/**
 * The number a player typed, or null if it isn't one. Accepts full-width
 * digits (from a Japanese keyboard) and ignores commas and spaces.
 */
export function parseNumberAnswer(input: string): number | null {
  const digits = input
    .normalize("NFKC") // ０-９ -> 0-9
    .replace(/[,\s_'.]/g, "");
  if (!/^\d{1,10}$/.test(digits)) return null;
  return Number(digits);
}

/** "12,345" */
export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/** A uniform number in [0, 1) from a seed and a position (mulberry32 step). */
function random(seed: number, index: number): number {
  let t = (seed + Math.imul(index + 1, 0x6d2b79f5)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function rawNumberAt(seed: number, index: number, min: number, max: number): number {
  return min + Math.floor(random(seed, index) * (max - min + 1));
}

/**
 * Draws numbers from a seeded stream without repeats: the same seed gives the
 * same numbers in the same order on every device. Numbers in `exclude` are
 * never drawn. Once the range runs out (only in small ranges) it starts a
 * fresh cycle, still never giving the same number twice in a row.
 */
class Draw {
  private readonly seed: number;
  private readonly min: number;
  private readonly max: number;
  private readonly exclude: ReadonlySet<number>;
  private readonly used = new Set<number>();
  private position = 0;
  private last: number | null = null;

  constructor(seed: number, min: number, max: number, exclude: ReadonlySet<number>) {
    this.seed = seed;
    this.min = min;
    this.max = max;
    this.exclude = exclude;
  }

  next(): number {
    const { min, max } = this;
    const span = max - min + 1;
    if (span - this.used.size - this.exclude.size <= 0) this.used.clear();
    // The excluded numbers fill the whole range: nothing else to give.
    const ignoreExclude = span - this.exclude.size <= 0;
    const ok = (n: number) =>
      !this.used.has(n) &&
      (ignoreExclude || !this.exclude.has(n)) &&
      (span === 1 || n !== this.last);
    const take = (n: number) => {
      this.used.add(n);
      this.last = n;
      return n;
    };

    for (let tries = 0; tries < 64; tries++) {
      const n = rawNumberAt(this.seed, this.position++, min, max);
      if (ok(n)) return take(n);
    }
    // Nearly used up (small ranges only): walk on from a random spot.
    const start = rawNumberAt(this.seed, this.position++, min, max) - min;
    for (let step = 0; step < span; step++) {
      const n = min + ((start + step) % span);
      if (ok(n)) return take(n);
    }
    return take(min + start);
  }
}

/**
 * A game's numbers, the same for every player (from the room's seed):
 *
 * - `main`: one number per round, all different when the range allows, in
 *   the same order for everyone -- round 5 is the same number for all.
 * - spares: what a skip gives you instead, never one of the main numbers.
 *   They're handed out in skip order, so everyone's first skip is the same
 *   number, their second skip the next one, and so on.
 */
export class NumberPool {
  readonly main: number[];
  private readonly spares: number[] = [];
  private readonly spareDraw: Draw;

  constructor(seed: number, { min, max, rounds }: Pick<NumberOptions, "min" | "max" | "rounds">) {
    const mainDraw = new Draw(seed, min, max, new Set());
    this.main = Array.from({ length: rounds }, () => mainDraw.next());
    this.spareDraw = new Draw((seed ^ 0x5bd1e995) >>> 0, min, max, new Set(this.main));
  }

  /** The replacement for a player's `k`-th skip (0 = their first). */
  spare(k: number): number {
    while (this.spares.length <= k) this.spares.push(this.spareDraw.next());
    return this.spares[k];
  }

  /**
   * The number a player is on: the round's main number, or -- if they've
   * skipped during this round -- the spare for their latest skip.
   */
  current({ correct, skips, skipsThisRound }: PoolPosition): number {
    return skipsThisRound > 0
      ? this.spare(skips - 1)
      : this.main[Math.min(correct, this.main.length - 1)];
  }
}

/** Where a player is in a game's numbers. */
export interface PoolPosition {
  /** Correct answers so far = the round they're on (0-based). */
  correct: number;
  /** Skips so far in the whole game. */
  skips: number;
  /** Skips since the round began (0 = still on the main number). */
  skipsThisRound: number;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}

/** The game's settings, chosen in the lobby or single-player setup. */
export interface NumberOptions {
  min: number;
  max: number;
  /** Correct answers needed to finish. */
  rounds: number;
  /** Hints each player may use in the game. */
  hints: number;
}

export const DEFAULT_NUMBER_OPTIONS: NumberOptions = { min: 1, max: 100, rounds: 10, hints: 3 };

/** Clamps options into range (and min <= max), for anything typed in. */
export function cleanNumberOptions(options: NumberOptions): NumberOptions {
  const whole = (value: number, fallback: number) =>
    Number.isFinite(value) ? Math.floor(value) : fallback;
  let min = Math.min(Math.max(whole(options.min, 1), 0), MAX_NUMBER);
  let max = Math.min(Math.max(whole(options.max, 100), 0), MAX_NUMBER);
  if (min > max) [min, max] = [max, min];
  const rounds = Math.min(Math.max(whole(options.rounds, 10), 1), 500);
  const hints = Math.min(Math.max(whole(options.hints, 0), 0), 500);
  return { min, max, rounds, hints };
}

/** Most-skipped numbers across players (or one run), most first. */
export function mostSkipped(lists: number[][], limit = 5) {
  const counts = new Map<number, number>();
  for (const list of lists) for (const n of list) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts]
    .map(([number, count]) => ({ number, count }))
    .sort((a, b) => b.count - a.count || a.number - b.number)
    .slice(0, limit);
}
