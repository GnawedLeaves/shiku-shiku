"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  createBattleRoom,
  inviteToBattle,
  leaveBattleRoom,
  setBattleOptions,
  setBattleSet,
  startBattle,
  toggleReady,
} from "@/lib/actions/battle";
import {
  applyGrade,
  cardMisses,
  countMisses,
  pickRequeuePosition,
  type Result,
  type SessionState,
} from "@/lib/study/applyGrade";
import { formatStudyTime } from "@/lib/study/useStudyTimer";
import { ordinal, playerColor, type PlayerColor } from "@/lib/battle/players";
import type {
  AnswerDisplayMode,
  BattleCard,
  BattleRoomStatus,
  QueueEntry,
} from "@/lib/supabase/database.types";
import StudyDeck from "@/components/StudyDeck";
import BattleChat from "@/components/battle/BattleChat";
import { EmoteButton, EmoteLayer, type LiveEmote } from "@/components/battle/Emotes";
import {
  EMOTE_COOLDOWN_MS,
  EMOTE_LIFETIME_MS,
  MAX_VISIBLE_EMOTES,
  findEmote,
} from "@/lib/battle/emotes";
import type { RealtimeChannel } from "@supabase/supabase-js";
import Avatar from "@/components/Avatar";
import CopyField from "@/components/CopyField";
import OnlineDot from "@/components/realtime/OnlineDot";
import { useOnlineUsers } from "@/components/realtime/RealtimeProvider";
import SubmitButton from "@/components/ui/SubmitButton";
import LinkButton from "@/components/ui/LinkButton";

export interface BattlePlayer {
  userId: string;
  /** Position in join order; fixes the player's colour. */
  joinIndex: number;
  name: string;
  avatarUrl: string | null;
  isHost: boolean;
  isReady: boolean;
  queue: QueueEntry[] | null;
  currentIndex: number;
  cleared: number;
  dontKnow: number;
  firstTry: number;
  finishedAt: string | null;
  /** 1 = first to clear the deck. Null until they finish (or if they gave up). */
  placement: number | null;
  forfeitedAt: string | null;
}

interface RoomInfo {
  id: string;
  code: string;
  name: string | null;
  hostId: string;
  status: BattleRoomStatus;
  setId: string | null;
  setName: string | null;
  deck: BattleCard[];
  startedAt: string | null;
  finishedAt: string | null;
  winnerId: string | null;
  maxPlayers: number;
  shuffle: boolean;
  /** Null = the whole set. */
  cardLimit: number | null;
}

interface SetOption {
  id: string;
  name: string;
  ownerId: string;
  cardCount: number;
}

interface Friend {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** A battle_room_members row as Realtime pushes it mid-game. */
interface MemberRow {
  user_id: string;
  cleared: number;
  dont_know: number;
  first_try: number;
  finished_at: string | null;
  forfeited_at: string | null;
  placement: number | null;
}

/** Progress fields that change mid-game, overlaid on the server's copy. */
type LiveProgress = Pick<BattlePlayer, "cleared" | "finishedAt" | "forfeitedAt" | "placement">;

const colorOf = (player: BattlePlayer): PlayerColor => playerColor(player.joinIndex);

/**
 * A battle room (2-5 players) through all three phases -- lobby, game,
 * results. Every change to the room or its players is pushed by Supabase
 * Realtime: in the lobby and on phase changes the page re-renders from the
 * server; mid-game other players' progress is applied straight from the
 * pushed rows.
 */
export default function BattleRoom({
  meId,
  room,
  players,
  setOptions,
  friends,
  inviteLink,
  answerMode,
  pointsEarned = 0,
}: {
  meId: string;
  room: RoomInfo;
  players: BattlePlayer[];
  setOptions: SetOption[];
  friends: Friend[];
  inviteLink: string;
  answerMode: AnswerDisplayMode;
  /** Reward points this battle earned the viewer (results only). */
  pointsEarned?: number;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const me = players.find((p) => p.userId === meId);
  const [live, setLive] = useState<Record<string, LiveProgress>>({});
  const [emotes, setEmotes] = useState<LiveEmote[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Last emote time per sender, to drop floods from a misbehaving client.
  const lastEmoteAt = useRef<Record<string, number>>({});
  const playerIds = useMemo(() => new Set(players.map((p) => p.userId)), [players]);

  /** Puts an emote on screen (ours or someone else's) and clears it later. */
  function showEmote(emoteId: string, userId: string) {
    if (!findEmote(emoteId) || !playerIds.has(userId)) return;
    const now = Date.now();
    if (now - (lastEmoteAt.current[userId] ?? 0) < EMOTE_COOLDOWN_MS * 0.8) return;
    lastEmoteAt.current[userId] = now;

    const id = crypto.randomUUID();
    const drift = Math.round((Math.random() - 0.5) * 48);
    setEmotes((current) => [...current, { id, emoteId, userId, drift }].slice(-MAX_VISIBLE_EMOTES));
    window.setTimeout(
      () => setEmotes((current) => current.filter((e) => e.id !== id)),
      EMOTE_LIFETIME_MS
    );
  }

  // Emotes are momentary, so they go over Realtime Broadcast on the room's
  // channel -- straight to the other players, never stored.
  function sendEmote(emoteId: string) {
    showEmote(emoteId, meId); // Broadcast doesn't echo back to the sender
    channelRef.current?.send({
      type: "broadcast",
      event: "emote",
      payload: { emoteId, userId: meId },
    });
  }

  const showEmoteRef = useRef(showEmote);
  useEffect(() => {
    showEmoteRef.current = showEmote;
  });

  useEffect(() => {
    const channel = supabase
      .channel(`battle-room:${room.id}`)
      .on("broadcast", { event: "emote" }, ({ payload }) => {
        const { emoteId, userId } = (payload ?? {}) as { emoteId?: string; userId?: string };
        if (emoteId && userId && userId !== meId) showEmoteRef.current(emoteId, userId);
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "battle_rooms", filter: `id=eq.${room.id}` },
        () => router.refresh()
      )
      // Deletes can't be filtered server-side; match the room id here.
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "battle_rooms" },
        (payload) => {
          if ((payload.old as { id?: string }).id === room.id) {
            router.push(`/battle?error=${encodeURIComponent("The host closed the room")}`);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "battle_room_members",
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => {
          const row = payload.new as Partial<MemberRow>;
          if (room.status === "in_progress") {
            if (row.user_id && row.user_id !== meId) {
              setLive((current) => ({
                ...current,
                [row.user_id!]: {
                  cleared: row.cleared ?? 0,
                  finishedAt: row.finished_at ?? null,
                  forfeitedAt: row.forfeited_at ?? null,
                  placement: row.placement ?? null,
                },
              }));
            }
          } else {
            router.refresh();
          }
        }
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [supabase, router, room.id, room.status, meId]);

  if (!me) {
    return <p className="text-sm opacity-60">You&apos;re not in this room.</p>;
  }

  if (room.status === "lobby") {
    return (
      <Lobby
        room={room}
        me={me}
        players={players}
        setOptions={setOptions}
        friends={friends}
        inviteLink={inviteLink}
      />
    );
  }

  if (room.status === "in_progress") {
    return (
      <>
        <Game
          room={room}
          me={me}
          // The server's copy, with any fresher Realtime progress laid over it.
          others={players
            .filter((p) => p.userId !== meId)
            .map((p) => ({ ...p, ...live[p.userId] }))}
          answerMode={answerMode}
        />
        <EmoteLayer
          emotes={emotes}
          players={Object.fromEntries(
            players.map((p) => [
              p.userId,
              { name: p.name, avatarUrl: p.avatarUrl, color: colorOf(p) },
            ])
          )}
        />
        <EmoteButton onSend={sendEmote} />
      </>
    );
  }

  return <Results room={room} me={me} players={players} pointsEarned={pointsEarned} />;
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

function PlayerCard({ player, isMe }: { player: BattlePlayer; isMe: boolean }) {
  const color = colorOf(player);
  return (
    <div className="flex flex-col border border-iron">
      <div className="h-2" style={{ backgroundColor: color.paint }} aria-hidden="true" />
      <div className="flex items-center gap-3 p-3">
        <Avatar url={player.avatarUrl} name={player.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-body-sm">
            <span className="truncate">{isMe ? `${player.name} (you)` : player.name}</span>
            <OnlineDot userId={player.userId} />
          </p>
          <p className="text-xs opacity-60">
            {player.isHost ? "Host" : player.isReady ? "Ready" : "Not ready"}
          </p>
        </div>
      </div>
    </div>
  );
}

const CARD_PRESETS = [20, 50] as const;

function describeOptions(shuffle: boolean, cardLimit: number | null) {
  return `${shuffle ? "Shuffled" : "In set order"} · ${cardLimit ? `${cardLimit} cards` : "All cards"}`;
}

function Lobby({
  room,
  me,
  players,
  setOptions,
  friends,
  inviteLink,
}: {
  room: RoomInfo;
  me: BattlePlayer;
  players: BattlePlayer[];
  setOptions: SetOption[];
  friends: Friend[];
  inviteLink: string;
}) {
  const isHost = me.isHost;
  const others = players.filter((p) => !p.isHost);
  const full = players.length >= room.maxPlayers;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // The room's set and options come from the server (pushed to everyone by
  // Realtime); the host's own changes show instantly while they save.
  const [setId, setOptimisticSetId] = useOptimistic(room.setId ?? "");
  const [options, setOptimisticOptions] = useOptimistic({
    shuffle: room.shuffle,
    cardLimit: room.cardLimit,
  });
  const [customDraft, setCustomDraft] = useState(
    room.cardLimit && !CARD_PRESETS.includes(room.cardLimit as 20 | 50)
      ? String(room.cardLimit)
      : ""
  );
  const [customOpen, setCustomOpen] = useState(Boolean(customDraft));

  const chosen = setOptions.find((option) => option.id === setId);
  const notReady = others.filter((p) => !p.isReady);

  const blocker =
    players.length < 2
      ? "Invite at least one more player."
      : !chosen
        ? "Pick a set to battle with."
        : chosen.cardCount === 0
          ? "That set has no cards."
          : notReady.length > 0
            ? `Waiting for ${notReady.map((p) => p.name).join(", ")} to get ready.`
            : null;

  function pickSet(next: string) {
    setError(null);
    startTransition(async () => {
      setOptimisticSetId(next);
      const result = await setBattleSet(room.id, next);
      if ("error" in result && result.error) setError(result.error);
    });
  }

  function saveOptions(next: { shuffle: boolean; cardLimit: number | null }) {
    setError(null);
    startTransition(async () => {
      setOptimisticOptions(next);
      const result = await setBattleOptions(room.id, next);
      if ("error" in result && result.error) setError(result.error);
    });
  }

  function applyCustom() {
    const n = Math.floor(Number(customDraft));
    if (n >= 1) saveOptions({ ...options, cardLimit: n });
  }

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await startBattle(room.id);
      if ("error" in result && result.error) setError(result.error);
    });
  }

  // Sets grouped by owner: the host's first, then each other player's.
  const owners = [players.find((p) => p.isHost), ...others].filter((p): p is BattlePlayer =>
    Boolean(p)
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3">
        <h1 className="break-words">{room.name ?? "Battle"}</h1>
        <span className="shrink-0 rounded-full border border-iron px-3 py-1 text-sm tracking-widest">
          {room.code}
        </span>
      </div>

      {error && <div className="alert alert-error text-sm py-2">{error}</div>}

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-subheading">Players</h2>
          <span className="text-sm opacity-60 tabular-nums">
            {players.length} / {room.maxPlayers}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {players.map((player) => (
            <PlayerCard key={player.userId} player={player} isMe={player.userId === me.userId} />
          ))}
          {!full && (
            <div className="flex items-center justify-center gap-2 border border-dashed border-iron p-3 text-sm opacity-60">
              <span className="loading loading-dots loading-xs" aria-hidden="true" />
              Waiting for players
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <span className="label-text">Set</span>
        {isHost ? (
          <select
            className="select select-bordered w-full"
            value={setId}
            onChange={(e) => pickSet(e.target.value)}
            disabled={isPending}
          >
            <option value="">Pick a set…</option>
            {/* One optgroup per player draws the line between their sets. */}
            {owners.map((owner) => {
              const sets = setOptions.filter((option) => option.ownerId === owner.userId);
              return (
                <optgroup
                  key={owner.userId}
                  label={owner.isHost ? "Your sets" : `${owner.name}'s sets`}
                >
                  {sets.length === 0 ? (
                    <option disabled>No sets to show</option>
                  ) : (
                    sets.map((option) => (
                      <option key={option.id} value={option.id} disabled={option.cardCount === 0}>
                        {option.name} ({option.cardCount})
                      </option>
                    ))
                  )}
                </optgroup>
              );
            })}
          </select>
        ) : (
          <p className="border border-iron px-4 py-3 text-body-sm">
            {chosen ? `${chosen.name} · ${chosen.cardCount} cards` : "The host is picking a set…"}
          </p>
        )}

        {/* Battle options: how the deck is drawn when the battle starts. */}
        {isHost ? (
          <details className="group border border-iron">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
              <span className="text-body-sm">Battle options</span>
              <span className="text-sm opacity-60">
                {describeOptions(options.shuffle, options.cardLimit)}
              </span>
              <span
                className="ml-auto text-lg leading-none transition-transform group-open:rotate-45"
                aria-hidden="true"
              >
                +
              </span>
            </summary>
            <div className="flex flex-col gap-4 border-t border-iron px-4 pt-3 pb-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="toggle toggle-sm toggle-primary"
                  checked={options.shuffle}
                  onChange={(e) => saveOptions({ ...options, shuffle: e.target.checked })}
                />
                <span>Shuffle card order</span>
              </label>
              <div className="flex flex-col gap-2">
                <span className="label-text">How many cards?</span>
                <div className="flex flex-wrap items-center gap-2">
                  {[null, ...CARD_PRESETS].map((preset) => (
                    <button
                      key={preset ?? "all"}
                      type="button"
                      aria-pressed={!customOpen && options.cardLimit === preset}
                      onClick={() => {
                        setCustomOpen(false);
                        saveOptions({ ...options, cardLimit: preset });
                      }}
                      className={`btn btn-sm ${!customOpen && options.cardLimit === preset ? "btn-primary" : "btn-outline"}`}
                    >
                      {preset ?? "All"}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-pressed={customOpen}
                    onClick={() => setCustomOpen(true)}
                    className={`btn btn-sm ${customOpen ? "btn-primary" : "btn-outline"}`}
                  >
                    Custom
                  </button>
                  {customOpen && (
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={customDraft}
                      placeholder="15"
                      onChange={(e) => setCustomDraft(e.target.value)}
                      // Saved when you're done typing, not on every keystroke.
                      onBlur={applyCustom}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyCustom())}
                      className="input input-bordered input-sm w-20"
                      aria-label="Custom number of cards"
                    />
                  )}
                </div>
                {chosen && options.cardLimit && options.cardLimit >= chosen.cardCount && (
                  <p className="text-xs opacity-60">
                    {chosen.name} has {chosen.cardCount} cards — all of them will be used.
                  </p>
                )}
                {options.cardLimit && (!chosen || options.cardLimit < chosen.cardCount) && (
                  <p className="text-xs opacity-60">
                    A random {options.cardLimit} cards from the set.
                  </p>
                )}
              </div>
            </div>
          </details>
        ) : (
          <p className="text-sm opacity-60">
            {describeOptions(options.shuffle, options.cardLimit)}
          </p>
        )}

        <p className="text-xs opacity-60">
          First to clear every card in flashcards mode wins; everyone plays on for their place.
          Missed cards go back into your deck.
        </p>
      </section>

      {/* The main action, centred: Ready for players, Start for the host. */}
      <div className="flex flex-col items-center gap-2 py-2">
        {isHost ? (
          <>
            <button
              type="button"
              className="btn btn-primary btn-lg w-full max-w-xs"
              disabled={Boolean(blocker) || isPending}
              onClick={start}
            >
              {isPending && <span className="loading loading-spinner loading-xs" />}
              Start battle
            </button>
            {blocker && <p className="text-sm opacity-60 text-center">{blocker}</p>}
          </>
        ) : (
          <>
            <form action={toggleReady.bind(null, room.id, !me.isReady)} className="w-full max-w-xs">
              <SubmitButton
                className={`btn btn-lg w-full ${me.isReady ? "btn-outline" : "btn-primary"}`}
                pendingText="…"
              >
                {me.isReady ? "Not ready" : "Ready"}
              </SubmitButton>
            </form>
            <p className="text-sm opacity-60 text-center">
              {me.isReady ? "Waiting for the host to start." : "Tap Ready when you are."}
            </p>
          </>
        )}
      </div>

      {isHost && !full && (
        <InvitePanel roomId={room.id} friends={friends} inviteLink={inviteLink} code={room.code} />
      )}

      {/* Chat once there's someone to talk to; it carries on after the match. */}
      {players.length >= 2 && (
        <BattleChat roomId={room.id} meId={me.userId} players={chatPlayers(players)} />
      )}

      <form action={leaveBattleRoom.bind(null, room.id)} className="self-start">
        <SubmitButton
          className="btn btn-ghost btn-sm text-error"
          pendingText="Leaving…"
          confirmText={isHost ? "Close this room for everyone?" : undefined}
        >
          {isHost ? "Close room" : "Leave room"}
        </SubmitButton>
      </form>
    </div>
  );
}

function chatPlayers(players: BattlePlayer[]) {
  return Object.fromEntries(players.map((p) => [p.userId, { name: p.name, color: colorOf(p) }]));
}

function InvitePanel({
  roomId,
  friends,
  inviteLink,
  code,
}: {
  roomId: string;
  friends: Friend[];
  inviteLink: string;
  code: string;
}) {
  const online = useOnlineUsers();
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...friends].sort(
    (a, b) => Number(online.has(b.id)) - Number(online.has(a.id)) || a.name.localeCompare(b.name)
  );

  async function invite(friendId: string) {
    setSending(friendId);
    setError(null);
    const result = await inviteToBattle(roomId, friendId);
    setSending(null);
    if ("error" in result && result.error) setError(result.error);
    else setInvited((prev) => new Set(prev).add(friendId));
  }

  return (
    <section className="flex flex-col gap-4 border-t border-iron pt-4">
      <h2 className="text-subheading">Invite players</h2>
      {error && <div className="alert alert-error text-sm py-2">{error}</div>}

      <div className="flex flex-col">
        {sorted.length === 0 && (
          <p className="text-sm opacity-60">No friends to invite yet — share the link instead.</p>
        )}
        {sorted.map((friend) => (
          <div key={friend.id} className="flex items-center gap-3 border-b border-iron py-2">
            <Avatar url={friend.avatarUrl} name={friend.name} size="sm" />
            <p className="flex flex-1 min-w-0 items-center gap-2">
              <span className="truncate">{friend.name}</span>
              <OnlineDot userId={friend.id} />
            </p>
            <button
              type="button"
              className={`btn btn-xs ${invited.has(friend.id) ? "btn-ghost" : "btn-primary"}`}
              disabled={sending !== null}
              onClick={() => invite(friend.id)}
            >
              {sending === friend.id && <span className="loading loading-spinner loading-xs" />}
              {invited.has(friend.id) ? "Invited · resend" : "Invite"}
            </button>
          </div>
        ))}
      </div>

      <CopyField label="Invite link" value={inviteLink} />
      <CopyField label="Room code" value={code} large />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

function progressStats(queue: QueueEntry[]) {
  let cleared = 0;
  let firstTry = 0;
  for (const entry of queue) {
    if (entry.type !== "card" || entry.status === "pending") continue;
    cleared++;
    if (entry.status === "correct" && !entry.misses) firstTry++;
  }
  return { cleared, firstTry, dontKnow: countMisses(queue) };
}

/** Seconds since the battle started, ticking once a second while running. */
function useElapsed(since: string | null, running: boolean) {
  const start = since ? new Date(since).getTime() : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  return start === null ? 0 : Math.max(0, Math.floor((now - start) / 1000));
}

/**
 * The race: one bar per player in their colour, yours first and thickest,
 * with a one-line read of where you stand.
 */
function RaceProgress({
  me,
  mine,
  others,
  total,
}: {
  me: BattlePlayer;
  mine: number;
  others: BattlePlayer[];
  total: number;
}) {
  const percent = (value: number) => `${total > 0 ? Math.min(100, (value / total) * 100) : 0}%`;
  const rows = [
    { player: me, cleared: mine, isMe: true },
    ...others.map((p) => ({ player: p, cleared: p.cleared, isMe: false })),
  ];
  const ahead = others.filter((p) => p.cleared > mine).length;
  const position = ahead + 1;

  return (
    <div className="flex flex-col gap-2">
      {rows.map(({ player, cleared, isMe }) => {
        const color = colorOf(player);
        const status = player.forfeitedAt
          ? "gave up"
          : player.placement
            ? ordinal(player.placement)
            : `${cleared} / ${total}`;
        return (
          <div
            key={player.userId}
            className={`flex items-center gap-3 ${player.forfeitedAt ? "opacity-50" : ""}`}
          >
            {/* Who it is: their picture, ringed in their colour to match the bar. */}
            {/* Fixed-width column so every bar starts at the same x. */}
            <span className="flex w-10 shrink-0 justify-center">
              <span
                className="rounded-full p-[3px]"
                style={{ backgroundColor: color.paint }}
                title={isMe ? "You" : player.name}
              >
                <Avatar url={player.avatarUrl} name={player.name} size={isMe ? "sm" : "xs"} />
              </span>
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{isMe ? "You" : player.name}</span>
                <span className="tabular-nums opacity-70">{status}</span>
              </div>
              <div
                role="progressbar"
                aria-label={`${isMe ? "Your" : `${player.name}'s`} progress`}
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={cleared}
                className={`w-full border border-iron ${isMe ? "h-3" : "h-1.5"}`}
              >
                <div
                  className="h-full transition-[width] duration-300"
                  style={{ width: percent(cleared), backgroundColor: color.paint }}
                />
              </div>
            </div>
          </div>
        );
      })}
      {others.length > 0 && (
        <p className="text-xs opacity-60" aria-live="polite">
          {position === 1 ? "You're in the lead" : `You're in ${ordinal(position)} place`}
        </p>
      )}
    </div>
  );
}

function Game({
  room,
  me,
  others,
  answerMode,
}: {
  room: RoomInfo;
  me: BattlePlayer;
  others: BattlePlayer[];
  answerMode: AnswerDisplayMode;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const cardsById = useMemo(
    () => Object.fromEntries(room.deck.map((card) => [card.id, card])),
    [room.deck]
  );
  const total = room.deck.length;
  const [state, setState] = useState<SessionState>({
    queue: me.queue ?? [],
    currentIndex: me.currentIndex,
  });
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Progress writes are chained so they reach the server in order.
  const writes = useRef<Promise<unknown>>(Promise.resolve());

  const done = state.currentIndex >= state.queue.length;
  const elapsed = useElapsed(room.startedAt, !done);
  const mine = progressStats(state.queue);
  const entry = state.queue[state.currentIndex];
  const winner = room.winnerId ? others.find((p) => p.userId === room.winnerId) : null;
  const stillPlaying = others.filter((p) => !p.finishedAt && !p.forfeitedAt);

  function grade(result: Result) {
    if (!entry || entry.type !== "card") return;
    const requeuePosition =
      result === "incorrect" ? pickRequeuePosition(state, entry.cardId) : undefined;
    const next = applyGrade(state, entry.cardId, result, { flashcards: true, requeuePosition });
    const finished = next.currentIndex >= next.queue.length;
    const stats = progressStats(next.queue);

    setState(next);
    setRevealed(false);

    writes.current = writes.current
      .then(async () => {
        const { error: saveError } = await supabase
          .from("battle_room_members")
          .update({
            queue: next.queue,
            current_index: next.currentIndex,
            cleared: stats.cleared,
            dont_know: stats.dontKnow,
            first_try: stats.firstTry,
          })
          .eq("room_id", room.id)
          .eq("user_id", me.userId);
        if (saveError) throw saveError;
        if (finished) {
          // Records my place; then fetch it (it isn't pushed to me by Realtime).
          const { error: finishError } = await supabase.rpc("finish_battle", { p_room: room.id });
          if (finishError) throw finishError;
          router.refresh();
        }
      })
      .catch(() => setError("Couldn't sync your progress — check your connection."));
  }

  return (
    <div className="flex h-full min-h-140 flex-col gap-3">
      {error && <div className="alert alert-error text-sm py-2">{error}</div>}

      <div className="flex items-center justify-between gap-3">
        <p className="text-subheading tabular-nums" aria-label="Battle time">
          {formatStudyTime(elapsed)}
        </p>
        <form action={leaveBattleRoom.bind(null, room.id)}>
          <SubmitButton
            className="btn btn-ghost btn-xs"
            pendingText="Leaving…"
            confirmText={
              done
                ? undefined
                : winner
                  ? `Stop here? ${winner.name} has already won — you'll be listed as giving up.`
                  : "Give up the battle? You'll be listed as giving up."
            }
          >
            {/* Once you've finished, leaving doesn't affect the battle. */}
            {done ? "Leave" : winner ? "Give up" : "Forfeit"}
          </SubmitButton>
        </form>
      </div>

      <RaceProgress me={me} mine={mine.cleared} others={others} total={total} />

      {winner && !done && (
        <p className="border border-iron px-3 py-2 text-sm" role="status">
          {winner.name} finished first — keep going for your place.
        </p>
      )}

      <div className="flex flex-1 min-h-0 flex-col">
        {done || !entry || entry.type !== "card" ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
            role="status"
          >
            {me.placement ? (
              <>
                <p className="display">
                  {me.placement === 1 ? "First!" : `${ordinal(me.placement)}!`}
                </p>
                <p className="text-subheading">
                  You cleared the deck in {formatStudyTime(elapsed)}.
                </p>
                {stillPlaying.length > 0 && (
                  <p className="flex items-center gap-2 text-sm opacity-60">
                    <span className="loading loading-dots loading-xs" aria-hidden="true" />
                    Waiting for {stillPlaying.map((p) => p.name).join(", ")} — results appear when
                    everyone&apos;s done.
                  </p>
                )}
              </>
            ) : (
              <>
                <span className="loading loading-spinner loading-md" aria-hidden="true" />
                <p className="text-subheading">Deck cleared!</p>
                <p className="text-sm opacity-60">Recording your place…</p>
              </>
            )}
          </div>
        ) : (
          <StudyDeck
            card={cardsById[entry.cardId]}
            cardKey={`${entry.cardId}:${cardMisses(entry, entry.cardId)}`}
            answerMode={answerMode}
            revealed={revealed}
            cardsBehind={state.queue.length - state.currentIndex - 1}
            onReveal={() => setRevealed(true)}
            onGrade={grade}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function Results({
  room,
  me,
  players,
  pointsEarned,
}: {
  room: RoomInfo;
  me: BattlePlayer;
  players: BattlePlayer[];
  pointsEarned: number;
}) {
  const total = room.deck.length;
  const secondsBetween = (from: string | null, to: string | null) =>
    from && to
      ? Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000))
      : null;

  // Placed players in order, then anyone who gave up (most cards first).
  const ranked = [...players].sort(
    (a, b) =>
      (a.placement ?? Infinity) - (b.placement ?? Infinity) ||
      Number(Boolean(a.forfeitedAt)) - Number(Boolean(b.forfeitedAt)) ||
      b.cleared - a.cleared
  );
  const winner = players.find((p) => p.userId === room.winnerId) ?? null;
  const headline =
    me.placement === 1 ? "Victory." : me.placement ? `${ordinal(me.placement)}.` : "Defeat.";
  const others = players.filter((p) => p.userId !== me.userId);

  return (
    <div className="flex flex-col gap-6 py-4">
      <h1 className="display">{headline}</h1>
      <hr className="hairline" />
      <p className="text-subheading">
        {winner?.finishedAt
          ? `${winner.userId === me.userId ? "You" : winner.name} cleared ${total} cards in ${formatStudyTime(secondsBetween(room.startedAt, winner.finishedAt) ?? 0)}.`
          : winner
            ? `Everyone else gave up — ${winner.userId === me.userId ? "you win" : `${winner.name} wins`}.`
            : "The battle is over."}
      </p>
      {pointsEarned > 0 && (
        <p className="self-start rounded-full bg-iron px-4 py-1.5 text-body-sm text-concrete">
          +{pointsEarned} points
        </p>
      )}

      <ol className="flex flex-col border-t border-iron">
        {ranked.map((player) => {
          const color = colorOf(player);
          const time = secondsBetween(room.startedAt, player.finishedAt);
          return (
            <li key={player.userId} className="flex items-center gap-3 border-b border-iron py-3">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm"
                style={{ backgroundColor: color.paint, color: color.ink }}
              >
                {player.placement ?? "–"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm">
                  {player.userId === me.userId ? "You" : player.name}
                  {player.forfeitedAt && <span className="opacity-60"> · gave up</span>}
                </p>
                <p className="text-xs opacity-60">
                  {player.cleared}/{total} cleared · {player.firstTry} right first time ·{" "}
                  {player.dontKnow} don&apos;t know
                </p>
              </div>
              <span className="shrink-0 text-body-sm tabular-nums">
                {time !== null ? formatStudyTime(time) : "—"}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        {room.setId && others.length > 0 && (
          <form action={createBattleRoom}>
            <input type="hidden" name="set_id" value={room.setId} />
            {others.map((p) => (
              <input key={p.userId} type="hidden" name="invite" value={p.userId} />
            ))}
            <SubmitButton className="btn btn-primary" pendingText="Creating room…">
              Rematch
            </SubmitButton>
          </form>
        )}
        <LinkButton href="/battle" className="btn btn-outline">
          Back to battles
        </LinkButton>
      </div>

      {others.length > 0 && (
        <BattleChat
          roomId={room.id}
          meId={me.userId}
          players={chatPlayers(players)}
          title="Post-match chat"
        />
      )}
    </div>
  );
}
