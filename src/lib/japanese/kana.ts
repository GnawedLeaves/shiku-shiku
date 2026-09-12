import { toRomaji as wanakanaToRomaji, toHiragana, isKana, isKanji } from "wanakana";

/**
 * Romaji for a kana reading. Anything that isn't kana (kanji left in the
 * string, brackets, tildes) is passed through unchanged by wanakana, so the
 * result is still useful for a partially converted reading.
 */
export function toRomaji(reading: string | null | undefined): string {
  if (!reading) return "";
  return wanakanaToRomaji(reading.trim());
}

/** Katakana readings are normalised to hiragana for the answer field. */
export function normalizeReading(reading: string | null | undefined): string {
  if (!reading) return "";
  return toHiragana(reading.trim(), { passRomaji: true });
}

export function containsKanji(text: string | null | undefined): boolean {
  if (!text) return false;
  return [...text].some((char) => isKanji(char));
}

export function isKanaOnly(text: string | null | undefined): boolean {
  if (!text) return false;
  return [...text.replace(/[\s（）()［］[\]〜~・*、。]/g, "")].every((char) => isKana(char));
}
