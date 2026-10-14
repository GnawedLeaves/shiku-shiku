"use client";

import { useCallback, useEffect, useState } from "react";

/** Known good Japanese voices, best first, when a device has several. */
const PREFERRED = ["Google 日本語", "Kyoko", "O-Ren", "Otoya", "Nanami", "Haruka", "Ayumi"];

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const japanese = voices.filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith("ja"));
  for (const name of PREFERRED) {
    const match = japanese.find((v) => v.name.includes(name));
    if (match) return match;
  }
  return japanese[0] ?? null;
}

export type SpeechSupport =
  /** Still loading the voice list. */
  | "checking"
  | "ready"
  /** Speech works but there's no Japanese voice: the browser will guess. */
  | "no-japanese-voice"
  | "unsupported";

/**
 * Reads numbers aloud in Japanese with the browser's own speech synthesis.
 * Numerals are spoken as digits ("102"), which Japanese voices read as
 * ひゃくに.
 */
export function useJapaneseSpeech() {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [support, setSupport] = useState<SpeechSupport>("checking");
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    // Typed as always present, but missing in some browsers and webviews.
    const synth = window.speechSynthesis as SpeechSynthesis | undefined;
    if (!synth) {
      const id = window.setTimeout(() => setSupport("unsupported"), 0);
      return () => window.clearTimeout(id);
    }
    const update = () => {
      const voices = synth.getVoices();
      if (voices.length === 0) return; // Chrome fills the list in later
      const chosen = pickVoice(voices);
      setVoice(chosen);
      setSupport(chosen ? "ready" : "no-japanese-voice");
    };
    update();
    synth.addEventListener("voiceschanged", update);
    // Some browsers never fire voiceschanged; settle after a moment.
    const timeout = window.setTimeout(() => {
      update();
      setSupport((current) => (current === "checking" ? "no-japanese-voice" : current));
    }, 1500);
    return () => {
      synth.removeEventListener("voiceschanged", update);
      window.clearTimeout(timeout);
      synth.cancel();
    };
  }, []);

  const speak = useCallback(
    (n: number, { slow = false }: { slow?: boolean } = {}) => {
      const synth = window.speechSynthesis as SpeechSynthesis | undefined;
      if (!synth) return;
      synth.cancel(); // a replay interrupts rather than queues
      const utterance = new SpeechSynthesisUtterance(String(n));
      utterance.lang = "ja-JP";
      if (voice) utterance.voice = voice;
      utterance.rate = slow ? 0.6 : 0.9;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      synth.speak(utterance);
    },
    [voice]
  );

  return { speak, speaking, support };
}
