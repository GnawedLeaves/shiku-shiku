"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Avatar from "@/components/Avatar";
import { EMOTES, EMOTE_COOLDOWN_MS, findEmote, type Emote } from "@/lib/battle/emotes";
import type { PlayerColor } from "@/lib/battle/players";

/** One emote on screen. */
export interface LiveEmote {
  id: string;
  emoteId: string;
  userId: string;
  /** Horizontal drift (px) so a burst of emotes doesn't stack exactly. */
  drift: number;
}

export interface EmotePlayer {
  name: string;
  avatarUrl: string | null;
  color: PlayerColor;
}

/** Sits just above the bottom nav (and the iPhone home indicator). */
const ABOVE_NAV = "calc(5.5rem + env(safe-area-inset-bottom))";

function EmoteFace({ emote, size }: { emote: Emote; size: number }) {
  return emote.src ? (
    // eslint-disable-next-line @next/next/no-img-element -- local artwork, any size
    <img src={emote.src} alt="" className="h-full w-full object-cover" />
  ) : (
    <span style={{ fontSize: size * 0.55, lineHeight: 1 }} aria-hidden="true">
      {emote.emoji}
    </span>
  );
}

/**
 * The emote itself: a circle with the artwork (or placeholder emoji), and the
 * sender's profile picture in a small circle at its bottom right, ringed in
 * their player colour.
 */
function EmoteBubble({ emote, player }: { emote: Emote; player: EmotePlayer | undefined }) {
  return (
    <div className="relative h-16 w-16">
      <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full border border-iron bg-concrete">
        <EmoteFace emote={emote} size={64} />
      </div>
      {player && (
        <span
          className="absolute -right-1 -bottom-1 rounded-full p-[2px]"
          style={{ backgroundColor: player.color.paint }}
          title={player.name}
        >
          <Avatar url={player.avatarUrl} name={player.name} size="xs" />
        </span>
      )}
    </div>
  );
}

/**
 * Emotes floating up the right edge of the screen for everyone in the battle.
 * Purely visual, so it never blocks taps on the deck underneath.
 */
export function EmoteLayer({
  emotes,
  players,
}: {
  emotes: LiveEmote[];
  players: Record<string, EmotePlayer>;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className="pointer-events-none fixed right-4 z-30 h-0 w-16"
      style={{ bottom: `calc(${ABOVE_NAV} + 3.75rem)` }}
      aria-live="polite"
    >
      <AnimatePresence>
        {emotes.map((live) => {
          const emote = findEmote(live.emoteId);
          if (!emote) return null;
          const player = players[live.userId];
          return (
            <motion.div
              key={live.id}
              className="absolute bottom-0 left-0"
              role="img"
              aria-label={`${player?.name ?? "Someone"}: ${emote.label}`}
              initial={{ opacity: 0, y: 0, x: 0, scale: 0.6 }}
              animate={
                reduceMotion
                  ? { opacity: [0, 1, 1, 0], scale: 1 }
                  : { opacity: [0, 1, 1, 0], y: -260, x: live.drift, scale: 1 }
              }
              transition={{ duration: 2.8, ease: "easeOut", times: [0, 0.12, 0.75, 1] }}
            >
              <EmoteBubble emote={emote} player={player} />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/**
 * The floating emote button and its picker. `onSend` is rate-limited here so
 * a held-down tap can't flood the room.
 */
export function EmoteButton({ onSend }: { onSend: (emoteId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on Escape or a tap anywhere else.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  function send(emoteId: string) {
    if (coolingDown) return;
    onSend(emoteId);
    setOpen(false);
    setCoolingDown(true);
    window.setTimeout(() => setCoolingDown(false), EMOTE_COOLDOWN_MS);
  }

  return (
    <div ref={rootRef} className="fixed right-4 z-30" style={{ bottom: ABOVE_NAV }}>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Send an emote"
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 bottom-14 grid w-64 grid-cols-4 gap-2 border border-iron bg-concrete p-3"
          >
            {EMOTES.map((emote) => (
              <button
                key={emote.id}
                type="button"
                role="menuitem"
                aria-label={emote.label}
                title={emote.label}
                disabled={coolingDown}
                onClick={() => send(emote.id)}
                className="grid aspect-square place-items-center overflow-hidden rounded-full border border-iron transition-transform hover:scale-110 disabled:opacity-40"
              >
                <EmoteFace emote={emote} size={48} />
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        aria-label={open ? "Close emotes" : "Send an emote"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid h-11 w-11 place-items-center rounded-full border border-iron bg-concrete text-iron transition-transform active:scale-95"
      >
        {/* SVG rather than a text glyph, so it sits dead centre in the circle. */}
        {open ? <CloseIcon /> : <SmileyIcon />}
      </button>
    </div>
  );
}

function SmileyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="10" r="1.25" fill="currentColor" />
      <circle cx="15" cy="10" r="1.25" fill="currentColor" />
      <path
        d="M8 14.25c1 1.4 2.4 2.1 4 2.1s3-.7 4-2.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
