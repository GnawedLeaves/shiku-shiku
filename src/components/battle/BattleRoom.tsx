"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  createBattleRoom,
  inviteToBattle,
  leaveBattleRoom,
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
import type {
  AnswerDisplayMode,
  BattleCard,
  BattleRoomStatus,
  QueueEntry,
} from "@/lib/supabase/database.types";
import StudyDeck from "@/components/StudyDeck";
import Avatar from "@/components/Avatar";
import CopyField from "@/components/CopyField";
import OnlineDot from "@/components/realtime/OnlineDot";
import { useOnlineUsers } from "@/components/realtime/RealtimeProvider";
import SubmitButton from "@/components/ui/SubmitButton";
import LinkButton from "@/components/ui/LinkButton";

export interface BattlePlayer {
  userId: string;
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

/** Live progress columns of a battle_room_members row, as Realtime sends it. */
interface MemberRow {
  user_id: string;
  cleared: number;
  dont_know: number;
  first_try: number;
}

/**
 * A 1v1 battle room through all three phases -- lobby, game, results. Every
 * change to the room or its players is pushed by Supabase Realtime: in the
 * lobby and on phase changes the page re-renders from the server; mid-game the
 * opponent's progress is applied straight from the pushed row.
 */
export default function BattleRoom({
  meId,
  room,
  players,
  setOptions,
  friends,
  inviteLink,
  answerMode,
}: {
  meId: string;
  room: RoomInfo;
  players: BattlePlayer[];
  setOptions: SetOption[];
  friends: Friend[];
  inviteLink: string;
  answerMode: AnswerDisplayMode;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const me = players.find((p) => p.userId === meId);
  const opponent = players.find((p) => p.userId !== meId) ?? null;
  const [opponentLive, setOpponentLive] = useState<MemberRow | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`battle-room:${room.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "battle_rooms", filter: `id=eq.${room.id}` },
        () => router.refresh()
      )
      // Deletes can't be filtered server-side; match the room id here.
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "battle_rooms" }, (payload) => {
        if ((payload.old as { id?: string }).id === room.id) {
          router.push(`/battle?error=${encodeURIComponent("The host closed the room")}`);
        }
      })
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
            if (row.user_id && row.user_id !== meId) setOpponentLive(row as MemberRow);
          } else {
            router.refresh();
          }
        }
      )
      .subscribe();

    return () => {
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
        opponent={opponent}
        setOptions={setOptions}
        friends={friends}
        inviteLink={inviteLink}
      />
    );
  }

  if (room.status === "in_progress") {
    return (
      <Game
        room={room}
        me={me}
        opponent={opponent}
        opponentCleared={opponentLive?.cleared ?? opponent?.cleared ?? 0}
        answerMode={answerMode}
      />
    );
  }

  return <Results room={room} me={me} opponent={opponent} />;
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

function PlayerSlot({ player, label }: { player: BattlePlayer | null; label: string }) {
  if (!player) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 border border-dashed border-iron p-4 text-center">
        <span className="loading loading-dots loading-sm opacity-60" aria-hidden="true" />
        <p className="text-sm opacity-60">Waiting for an opponent</p>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center gap-2 border border-iron p-4 text-center">
      <Avatar url={player.avatarUrl} name={player.name} size="md" />
      <p className="flex items-center gap-2 text-body-sm">
        <span className="max-w-[9rem] truncate">{player.name}</span>
        <OnlineDot userId={player.userId} />
      </p>
      <p className="text-xs opacity-60">
        {label}
        {!player.isHost && (player.isReady ? " · Ready" : " · Not ready")}
      </p>
    </div>
  );
}

function Lobby({
  room,
  me,
  opponent,
  setOptions,
  friends,
  inviteLink,
}: {
  room: RoomInfo;
  me: BattlePlayer;
  opponent: BattlePlayer | null;
  setOptions: SetOption[];
  friends: Friend[];
  inviteLink: string;
}) {
  const isHost = me.isHost;
  const host = isHost ? me : opponent;
  const guest = isHost ? opponent : me;
  const [setId, setSetId] = useState(room.setId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const chosen = setOptions.find((option) => option.id === setId);
  const hostSets = setOptions.filter((option) => option.ownerId === room.hostId);
  const guestSets = setOptions.filter((option) => option.ownerId !== room.hostId);

  const blocker = !guest
    ? "Waiting for an opponent to join."
    : !chosen
      ? "Pick a set to battle with."
      : chosen.cardCount === 0
        ? "That set has no cards."
        : !guest.isReady
          ? `Waiting for ${guest.name} to get ready.`
          : null;

  function pickSet(next: string) {
    setSetId(next);
    setError(null);
    startTransition(async () => {
      const result = await setBattleSet(room.id, next);
      if ("error" in result && result.error) setError(result.error);
    });
  }

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await startBattle(room.id);
      if ("error" in result && result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3">
        <h1 className="break-words">{room.name ?? "Battle"}</h1>
        <span className="shrink-0 rounded-full border border-iron px-3 py-1 text-sm tracking-widest">
          {room.code}
        </span>
      </div>

      {error && <div className="alert alert-error text-sm py-2">{error}</div>}

      <div className="flex items-stretch gap-3">
        <PlayerSlot player={host} label="Host" />
        <span className="self-center text-subheading" aria-hidden="true">
          vs
        </span>
        <PlayerSlot player={guest} label="Challenger" />
      </div>

      <div className="flex flex-col gap-2">
        <span className="label-text">Set</span>
        {isHost ? (
          <select
            className="select select-bordered w-full"
            value={setId}
            onChange={(e) => pickSet(e.target.value)}
            disabled={isPending}
          >
            <option value="">Pick a set…</option>
            {/* Optgroups draw the line between the two players' sets. */}
            <optgroup label="Your sets">
              {hostSets.map((option) => (
                <option key={option.id} value={option.id} disabled={option.cardCount === 0}>
                  {option.name} ({option.cardCount})
                </option>
              ))}
            </optgroup>
            {guest && (
              <optgroup label={`${guest.name}'s sets`}>
                {guestSets.length === 0 ? (
                  <option disabled>No sets to show</option>
                ) : (
                  guestSets.map((option) => (
                    <option key={option.id} value={option.id} disabled={option.cardCount === 0}>
                      {option.name} ({option.cardCount})
                    </option>
                  ))
                )}
              </optgroup>
            )}
          </select>
        ) : (
          <p className="border border-iron px-4 py-3 text-body-sm">
            {chosen ? `${chosen.name} · ${chosen.cardCount} cards` : "The host is picking a set…"}
          </p>
        )}
        <p className="text-xs opacity-60">
          Clear every card in flashcards mode before your opponent to win. Missed cards go back into
          your deck.
        </p>
      </div>

      {/* The main action, centred: Ready for the challenger, Start for the host. */}
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

      {isHost && !guest && <InvitePanel roomId={room.id} friends={friends} inviteLink={inviteLink} code={room.code} />}

      <form action={leaveBattleRoom.bind(null, room.id)} className="self-start">
        <SubmitButton
          className="btn btn-ghost btn-sm"
          pendingText="Leaving…"
          confirmText={isHost ? "Close this room for everyone?" : undefined}
        >
          {isHost ? "Close room" : "Leave room"}
        </SubmitButton>
      </form>
    </div>
  );
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
      <h2 className="text-subheading">Invite someone</h2>
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
 * The race: your progress as the main bar, the opponent's as a thinner, lighter
 * bar right under it, so a glance shows who's ahead.
 */
function RaceProgress({
  mine,
  theirs,
  total,
  opponentName,
}: {
  mine: number;
  theirs: number;
  total: number;
  opponentName: string;
}) {
  const percent = (value: number) => `${total > 0 ? Math.min(100, (value / total) * 100) : 0}%`;
  const lead = mine - theirs;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between gap-2 text-xs">
        <span>You</span>
        <span className="tabular-nums">
          {mine} / {total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Your progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={mine}
        className="h-2.5 w-full border border-iron"
      >
        <div className="h-full bg-iron transition-[width] duration-300" style={{ width: percent(mine) }} />
      </div>
      <div
        role="progressbar"
        aria-label={`${opponentName}'s progress`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={theirs}
        className="h-1.5 w-full border border-iron/40"
      >
        <div
          className="h-full bg-iron/40 transition-[width] duration-500"
          style={{ width: percent(theirs) }}
        />
      </div>
      <div className="flex justify-between gap-2 text-xs opacity-70">
        <span className="truncate">{opponentName}</span>
        <span className="tabular-nums">
          {theirs} / {total}
        </span>
      </div>
      <p className="text-xs opacity-60" aria-live="polite">
        {lead > 0
          ? `You're ahead by ${lead}`
          : lead < 0
            ? `${opponentName} is ahead by ${-lead}`
            : "Neck and neck"}
      </p>
    </div>
  );
}

function Game({
  room,
  me,
  opponent,
  opponentCleared,
  answerMode,
}: {
  room: RoomInfo;
  me: BattlePlayer;
  opponent: BattlePlayer | null;
  opponentCleared: number;
  answerMode: AnswerDisplayMode;
}) {
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
        // Claims the win; the room update then moves both screens to results.
        if (finished) {
          const { error: finishError } = await supabase.rpc("finish_battle", { p_room: room.id });
          if (finishError) throw finishError;
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
            confirmText="Forfeit the battle? Your opponent will win."
          >
            Forfeit
          </SubmitButton>
        </form>
      </div>

      <RaceProgress
        mine={mine.cleared}
        theirs={opponentCleared}
        total={total}
        opponentName={opponent?.name ?? "Opponent"}
      />

      <div className="flex flex-1 min-h-0 flex-col">
        {done || !entry || entry.type !== "card" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <span className="loading loading-spinner loading-md" aria-hidden="true" />
            <p className="text-subheading">Deck cleared!</p>
            <p className="text-sm opacity-60">Checking who finished first…</p>
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
  opponent,
}: {
  room: RoomInfo;
  me: BattlePlayer;
  opponent: BattlePlayer | null;
}) {
  const won = room.winnerId === me.userId;
  const total = room.deck.length;
  const winner = [me, opponent].find((p) => p?.userId === room.winnerId) ?? null;
  const forfeit = Boolean(winner && !winner.finishedAt);
  const secondsBetween = (from: string | null, to: string | null) =>
    from && to ? Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000)) : null;
  const winningTime = secondsBetween(room.startedAt, winner?.finishedAt ?? null);

  const columns = [me, opponent].filter((p): p is BattlePlayer => Boolean(p));

  return (
    <div className="flex flex-col gap-6 py-4">
      <h1 className="display">{won ? "Victory." : "Defeat."}</h1>
      <hr className="hairline" />
      <p className="text-subheading">
        {forfeit
          ? `${won ? (opponent?.name ?? "Your opponent") : "You"} left the battle.`
          : winner
            ? `${winner.userId === me.userId ? "You" : winner.name} cleared ${total} cards in ${formatStudyTime(winningTime ?? 0)}.`
            : "The battle is over."}
      </p>

      <div className="grid grid-cols-2 border-t border-l border-iron">
        {columns.map((player) => {
          const time = secondsBetween(room.startedAt, player.finishedAt);
          return (
            <div key={player.userId} className="flex flex-col gap-3 border-b border-r border-iron p-4">
              <div className="flex items-center gap-2">
                <Avatar url={player.avatarUrl} name={player.name} size="sm" />
                <p className="min-w-0 truncate text-body-sm">
                  {player.userId === me.userId ? "You" : player.name}
                </p>
              </div>
              {player.userId === room.winnerId && (
                <span className="self-start rounded-full bg-iron px-2 py-0.5 text-xs text-concrete">
                  Winner
                </span>
              )}
              <dl className="flex flex-col gap-2 text-sm">
                <Stat label="Cleared" value={`${player.cleared} / ${total}`} />
                <Stat label="Right first time" value={player.firstTry} />
                <Stat label="Don't know" value={player.dontKnow} />
                <Stat label="Time" value={time !== null ? formatStudyTime(time) : "—"} />
              </dl>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {room.setId && opponent && (
          <form action={createBattleRoom}>
            <input type="hidden" name="set_id" value={room.setId} />
            <input type="hidden" name="invite" value={opponent.userId} />
            <SubmitButton className="btn btn-primary" pendingText="Creating room…">
              Rematch
            </SubmitButton>
          </form>
        )}
        <LinkButton href="/battle" className="btn btn-outline">
          Back to battles
        </LinkButton>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="opacity-60">{label}</dt>
      <dd className="text-body-sm tabular-nums">{value}</dd>
    </div>
  );
}
