"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PlayerColor } from "@/lib/battle/players";

interface ChatMessage {
  id: string;
  userId: string;
  body: string;
  createdAt: string;
  status?: "sending" | "failed";
}

const MAX_LENGTH = 500;
const HISTORY_LIMIT = 100;

/** Room for the header, banner, chat title and input when sizing the list. */
const CHROME_HEIGHT = 200;
const LIST_MIN = 140;
const LIST_MAX = 320;

/**
 * The visible height of the page. On iOS the on-screen keyboard shrinks only
 * this (not the layout viewport), so it's how the chat knows how much room is
 * left to show messages above the keyboard.
 */
function useVisibleHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setHeight(viewport.height);
    update();
    viewport.addEventListener("resize", update);
    return () => viewport.removeEventListener("resize", update);
  }, []);
  return height;
}

const byTime = (a: ChatMessage, b: ChatMessage) => a.createdAt.localeCompare(b.createdAt);

/**
 * Chat between the two players of a battle room -- in the lobby while getting
 * ready and in the post-match lobby afterwards (same room, same history).
 * Messages are stored in battle_messages and pushed live by Realtime.
 */
export default function BattleChat({
  roomId,
  meId,
  players,
  title = "Chat",
}: {
  roomId: string;
  meId: string;
  /** Each player's name and identity colour, by user id. */
  players: Record<string, { name: string; color: PlayerColor }>;
  title?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const visibleHeight = useVisibleHeight();

  /** Adds messages, skipping any already shown (e.g. our own Realtime echo). */
  function merge(incoming: ChatMessage[]) {
    setMessages((current) => {
      const known = new Set(current.map((m) => m.id));
      const fresh = incoming.filter((m) => !known.has(m.id));
      return fresh.length ? [...current, ...fresh].sort(byTime) : current;
    });
  }

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("battle_messages")
      .select("id, user_id, body, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT)
      .then(({ data }) => {
        if (cancelled) return;
        merge(
          (data ?? []).map((row) => ({
            id: row.id,
            userId: row.user_id,
            body: row.body,
            createdAt: row.created_at,
          }))
        );
        setLoaded(true);
      });

    const channel = supabase
      .channel(`battle-chat:${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "battle_messages", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as { id: string; user_id: string; body: string; created_at: string };
          merge([{ id: row.id, userId: row.user_id, body: row.body, createdAt: row.created_at }]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, roomId]);

  // Stick to the newest message.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  // When the keyboard opens (or closes) while typing, keep the input in view.
  useEffect(() => {
    if (document.activeElement === inputRef.current) {
      inputRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [visibleHeight]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim().slice(0, MAX_LENGTH);
    if (!body) return;

    const tempId = `temp-${crypto.randomUUID()}`;
    setDraft("");
    merge([{ id: tempId, userId: meId, body, createdAt: new Date().toISOString(), status: "sending" }]);

    const { data, error } = await supabase
      .from("battle_messages")
      .insert({ room_id: roomId, user_id: meId, body })
      .select("id, created_at")
      .single();

    setMessages((current) => {
      if (error || !data) {
        return current.map((m) => (m.id === tempId ? { ...m, status: "failed" as const } : m));
      }
      // Swap the placeholder for the saved message (unless Realtime beat us to it).
      const withoutTemp = current.filter((m) => m.id !== tempId);
      if (withoutTemp.some((m) => m.id === data.id)) return withoutTemp;
      return [...withoutTemp, { id: data.id, userId: meId, body, createdAt: data.created_at }].sort(
        byTime
      );
    });
  }

  function retry(message: ChatMessage) {
    setMessages((current) => current.filter((m) => m.id !== message.id));
    setDraft(message.body);
    inputRef.current?.focus();
  }

  // Shrinks with the visible area, so messages stay readable above the keyboard.
  const listHeight =
    visibleHeight === null
      ? LIST_MAX
      : Math.max(LIST_MIN, Math.min(LIST_MAX, visibleHeight - CHROME_HEIGHT));

  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="text-subheading">{title}</h2>

      <div
        ref={listRef}
        className="flex flex-col gap-3 overflow-y-auto overscroll-contain border border-iron p-3"
        style={{ height: listHeight }}
        aria-live="polite"
      >
        {loaded && messages.length === 0 && (
          <p className="m-auto text-center text-sm opacity-60">
            Say hi — this chat stays open after the match too.
          </p>
        )}
        {messages.map((message) => {
          const own = message.userId === meId;
          const color = players[message.userId]?.color;
          return (
            <div
              key={message.id}
              className={`flex max-w-[80%] flex-col gap-0.5 ${own ? "self-end items-end" : "self-start items-start"}`}
            >
              <p className="text-[11px] opacity-60">
                {own ? "You" : (players[message.userId]?.name ?? "Player")} ·{" "}
                {new Date(message.createdAt).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              {/* Each player's bubbles carry their colour: filled for your own,
                  a thick border in theirs for everyone else. */}
              <p
                className={`whitespace-pre-wrap border-2 px-3 py-2 text-sm leading-snug [overflow-wrap:anywhere] ${
                  message.status === "sending" ? "opacity-60" : ""
                }`}
                style={
                  own
                    ? {
                        backgroundColor: color?.paint ?? "var(--color-iron)",
                        borderColor: color?.paint ?? "var(--color-iron)",
                        color: color?.ink ?? "var(--color-concrete)",
                      }
                    : { borderColor: color?.paint ?? "var(--color-iron)" }
                }
              >
                {message.body}
              </p>
              {message.status === "failed" && (
                <button type="button" className="text-[11px] text-error underline" onClick={() => retry(message)}>
                  Not sent — tap to retry
                </button>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={send} className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() =>
            // Give the keyboard a moment to open before scrolling the input up.
            window.setTimeout(() => inputRef.current?.scrollIntoView({ block: "nearest" }), 300)
          }
          maxLength={MAX_LENGTH}
          placeholder="Message"
          aria-label="Chat message"
          enterKeyHint="send"
          autoComplete="off"
          className="input input-bordered flex-1 min-w-0"
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!draft.trim()}
          // Keeps focus (and the phone keyboard) in the input after sending.
          onMouseDown={(e) => e.preventDefault()}
          onTouchEnd={(e) => {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }}
        >
          Send
        </button>
      </form>
    </section>
  );
}
