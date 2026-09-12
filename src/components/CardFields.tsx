"use client";

import { useEffect, useRef, useState } from "react";
import { toRomaji } from "@/lib/japanese/kana";
import type { JapaneseSuggestion } from "@/lib/japanese/suggest";

interface GroupOption {
  id: string;
  name: string;
}

/**
 * Question + answer fields for a card. Typing an English question looks the
 * word up in the dictionary and offers Japanese suggestions; picking one fills
 * the kana, kanji and romaji. Romaji also stays in sync while the kana field is
 * typed in by hand, unless it has been edited directly.
 */
export default function CardFields({
  groups,
  defaults,
  selectedGroupIds = [],
}: {
  groups: GroupOption[];
  defaults?: {
    question?: string;
    answer_hiragana?: string;
    answer_romaji?: string;
    answer_kanji?: string;
  };
  selectedGroupIds?: string[];
}) {
  const [question, setQuestion] = useState(defaults?.question ?? "");
  const [hiragana, setHiragana] = useState(defaults?.answer_hiragana ?? "");
  const [romaji, setRomaji] = useState(defaults?.answer_romaji ?? "");
  const [kanji, setKanji] = useState(defaults?.answer_kanji ?? "");

  const [suggestions, setSuggestions] = useState<JapaneseSuggestion[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Once the user edits romaji themselves, stop overwriting it.
  const romajiTouched = useRef(Boolean(defaults?.answer_romaji));

  function updateHiragana(value: string) {
    setHiragana(value);
    if (!romajiTouched.current) setRomaji(toRomaji(value));
  }

  const term = question.trim();
  const shouldSuggest = term.length >= 2 && !dismissed;
  // Derived rather than cleared in the effect, so stale results can't flash
  // while a new lookup is in flight.
  const visibleSuggestions = shouldSuggest ? suggestions : [];

  useEffect(() => {
    if (!shouldSuggest) return;

    const controller = new AbortController();
    // Debounced so a lookup only fires once typing settles.
    const timer = setTimeout(async () => {
      setIsSuggesting(true);
      setSuggestError(null);
      try {
        const response = await fetch(`/api/japanese/suggest?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Lookup failed");
        const payload = (await response.json()) as { suggestions: JapaneseSuggestion[] };
        setSuggestions(payload.suggestions ?? []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSuggestError("Couldn't reach the dictionary — type the answer in yourself.");
          setSuggestions([]);
        }
      } finally {
        setIsSuggesting(false);
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, shouldSuggest]);

  function applySuggestion(suggestion: JapaneseSuggestion) {
    setHiragana(suggestion.hiragana);
    setRomaji(suggestion.romaji);
    romajiTouched.current = false;
    if (suggestion.kanji) setKanji(suggestion.kanji);
    setDismissed(true);
  }

  return (
    <>
      <label className="form-control">
        <span className="label-text">Question (English)</span>
        <input
          name="question"
          required
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            setDismissed(false);
          }}
          className="input input-bordered w-full"
          placeholder="e.g. to borrow"
          autoComplete="off"
        />
      </label>

      {(isSuggesting || visibleSuggestions.length > 0 || suggestError) && (
        <div className="card bg-base-200">
          <div className="card-body p-3 gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide opacity-60">
                Japanese suggestions
              </span>
              {isSuggesting && <span className="loading loading-spinner loading-xs" />}
            </div>

            {suggestError && <p className="text-xs text-error">{suggestError}</p>}

            {!isSuggesting && !suggestError && visibleSuggestions.length === 0 && (
              <p className="text-xs opacity-60">No dictionary match.</p>
            )}

            <div className="flex flex-col gap-1">
              {visibleSuggestions.map((suggestion, i) => (
                <button
                  key={`${suggestion.word}-${i}`}
                  type="button"
                  className="btn btn-ghost btn-sm justify-start h-auto py-2 text-left"
                  onClick={() => applySuggestion(suggestion)}
                >
                  <span className="flex flex-col items-start gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="text-base font-medium">{suggestion.word}</span>
                      <span className="text-xs opacity-70">{suggestion.hiragana}</span>
                      {suggestion.common && <span className="badge badge-success badge-xs">common</span>}
                    </span>
                    <span className="text-xs opacity-60">{suggestion.meanings.join(", ")}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <label className="form-control">
        <span className="label-text">Answer — hiragana/katakana</span>
        <input
          name="answer_hiragana"
          value={hiragana}
          onChange={(e) => updateHiragana(e.target.value)}
          className="input input-bordered w-full"
          placeholder="かります"
          autoComplete="off"
        />
      </label>

      <label className="form-control">
        <span className="label-text">Answer — romaji</span>
        <input
          name="answer_romaji"
          value={romaji}
          onChange={(e) => {
            romajiTouched.current = true;
            setRomaji(e.target.value);
          }}
          className="input input-bordered w-full"
          placeholder="karimasu"
          autoComplete="off"
        />
        <span className="label-text-alt opacity-60 mt-1">Filled in from the kana as you type.</span>
      </label>

      <label className="form-control">
        <span className="label-text">Answer — kanji (optional)</span>
        <input
          name="answer_kanji"
          value={kanji}
          onChange={(e) => setKanji(e.target.value)}
          className="input input-bordered w-full"
          placeholder="借ります"
          autoComplete="off"
        />
      </label>

      {groups.length > 0 && (
        <fieldset className="form-control">
          <legend className="label-text mb-1">Groups</legend>
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => (
              <label key={group.id} className="label cursor-pointer gap-2 rounded-field bg-base-200 px-3 py-1">
                <input
                  type="checkbox"
                  name="group_ids"
                  value={group.id}
                  defaultChecked={selectedGroupIds.includes(group.id)}
                  className="checkbox checkbox-sm"
                />
                <span className="label-text">{group.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </>
  );
}
