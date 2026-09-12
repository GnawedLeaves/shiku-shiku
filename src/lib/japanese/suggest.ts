import { normalizeReading, toRomaji } from "./kana";

export interface JapaneseSuggestion {
  /** The word as written (kanji where the word has it, otherwise kana). */
  word: string;
  /** Kana reading, always hiragana. */
  hiragana: string;
  romaji: string;
  kanji: string;
  /** English senses, for disambiguating between suggestions. */
  meanings: string[];
  common: boolean;
}

interface JishoJapanese {
  word?: string;
  reading?: string;
}

interface JishoSense {
  english_definitions?: string[];
  parts_of_speech?: string[];
}

interface JishoEntry {
  slug?: string;
  is_common?: boolean;
  japanese?: JishoJapanese[];
  senses?: JishoSense[];
}

const JISHO_ENDPOINT = "https://jisho.org/api/v1/search/words";
const MAX_SUGGESTIONS = 6;

/**
 * Looks an English word up in Jisho's open dictionary API and returns
 * flashcard-ready suggestions. Called from the server so the browser never
 * hits a cross-origin endpoint, and so responses can be cached.
 */
export async function suggestJapanese(query: string): Promise<JapaneseSuggestion[]> {
  const keyword = query.trim();
  if (keyword.length < 2) return [];

  const url = `${JISHO_ENDPOINT}?keyword=${encodeURIComponent(keyword)}`;

  let payload: { data?: JishoEntry[] };
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      // Dictionary entries barely change; a day of caching keeps typing snappy.
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return [];
    payload = await response.json();
  } catch {
    // A dictionary outage must never block card creation.
    return [];
  }

  const suggestions: JapaneseSuggestion[] = [];

  for (const entry of payload.data ?? []) {
    const primary = entry.japanese?.[0];
    if (!primary) continue;

    const reading = normalizeReading(primary.reading ?? primary.word);
    const word = primary.word ?? primary.reading ?? "";
    if (!reading && !word) continue;

    suggestions.push({
      word,
      hiragana: reading || normalizeReading(word),
      romaji: toRomaji(reading || word),
      kanji: primary.word && primary.word !== reading ? primary.word : "",
      meanings: (entry.senses ?? [])
        .flatMap((sense) => sense.english_definitions ?? [])
        .slice(0, 4),
      common: Boolean(entry.is_common),
    });

    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }

  // Common words first -- they're what a learner usually wants on a card.
  return suggestions.sort((a, b) => Number(b.common) - Number(a.common));
}
