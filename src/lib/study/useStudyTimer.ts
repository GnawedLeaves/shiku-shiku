"use client";

import { useEffect, useRef, useState } from "react";

/** A tick gap longer than this means the device slept; don't count it. */
const MAX_TICK_MS = 5_000;

/**
 * A study-time stopwatch that only runs while the study screen is actually
 * open and visible: switching tabs, locking the phone or leaving the page
 * stops it. Starts from `initialSeconds` so a resumed session carries on.
 *
 * `onSave` is called with the running total every `saveEveryMs`, when the
 * page is hidden, and when the screen unmounts, so the server stays close to
 * up to date without a write every second.
 */
export function useStudyTimer({
  initialSeconds,
  running,
  onSave,
  saveEveryMs = 30_000,
}: {
  initialSeconds: number;
  running: boolean;
  onSave: (seconds: number) => void;
  saveEveryMs?: number;
}) {
  const elapsedMs = useRef(initialSeconds * 1000);
  const [seconds, setSeconds] = useState(initialSeconds);
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });

  useEffect(() => {
    if (!running) return;

    const visible = () => document.visibilityState === "visible";
    let last = performance.now();
    // Whether the page was visible since `last`: each stretch is counted by
    // the state it was in, so switching tabs neither drops the last visible
    // moment nor adds the hidden one.
    let wasVisible = visible();

    const tick = () => {
      const now = performance.now();
      if (wasVisible) {
        elapsedMs.current += Math.min(now - last, MAX_TICK_MS);
        setSeconds(Math.floor(elapsedMs.current / 1000));
      }
      last = now;
      wasVisible = visible();
    };
    const save = () => saveRef.current(Math.floor(elapsedMs.current / 1000));

    const ticker = window.setInterval(tick, 1000);
    const saver = window.setInterval(() => visible() && save(), saveEveryMs);
    const onVisibility = () => {
      tick(); // bank the time up to now (or skip the hidden stretch)
      if (!visible()) save();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      tick();
      save();
      window.clearInterval(ticker);
      window.clearInterval(saver);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [running, saveEveryMs]);

  /** The exact running total right now (between ticks too). */
  return { seconds, current: () => Math.floor(elapsedMs.current / 1000) };
}

/** 75 -> "1:15", 3725 -> "1:02:05". */
export function formatStudyTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
