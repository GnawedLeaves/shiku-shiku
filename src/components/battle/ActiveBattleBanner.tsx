"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { leaveBattleFromBanner } from "@/lib/actions/battle";
import LinkButton from "@/components/ui/LinkButton";
import SubmitButton from "@/components/ui/SubmitButton";
import type { BattleRoomStatus } from "@/lib/supabase/database.types";

interface ActiveBattle {
  roomId: string;
  status: BattleRoomStatus;
  isHost: boolean;
  opponentName: string | null;
}

/**
 * A bar under the app header whenever the user is still in an unfinished
 * battle room (lobby or mid-battle) but has wandered off its page -- so a
 * stray tap on the nav never strands them. Offers Rejoin, or Leave (which
 * forfeits mid-battle, or closes the room if they're the host in the lobby).
 */
export default function ActiveBattleBanner({ userId }: { userId: string }) {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [battle, setBattle] = useState<ActiveBattle | null>(null);
  // Bumped by Realtime events and by leaving, to look again.
  const [version, recheck] = useReducer((n: number) => n + 1, 0);

  // Re-checked on every page change, since that's when the user leaves a room.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("battle_room_members")
        .select("room_id, battle_rooms!inner(status, host_id, created_at)")
        .eq("user_id", userId)
        .in("battle_rooms.status", ["lobby", "in_progress"]);

      // A battle in progress matters more than a waiting lobby; then newest.
      const row = (data ?? []).sort(
        (a, b) =>
          Number(b.battle_rooms.status === "in_progress") -
            Number(a.battle_rooms.status === "in_progress") ||
          b.battle_rooms.created_at.localeCompare(a.battle_rooms.created_at)
      )[0];

      if (!row) {
        if (!cancelled) setBattle(null);
        return;
      }

      const { data: others } = await supabase
        .from("battle_room_members")
        .select("user_id")
        .eq("room_id", row.room_id)
        .neq("user_id", userId)
        .limit(1);
      const opponentId = others?.[0]?.user_id;
      const { data: profile } = opponentId
        ? await supabase.from("profiles").select("display_name").eq("id", opponentId).maybeSingle()
        : { data: null };

      if (!cancelled) {
        setBattle({
          roomId: row.room_id,
          status: row.battle_rooms.status,
          isHost: row.battle_rooms.host_id === userId,
          opponentName: opponentId ? (profile?.display_name ?? "your opponent") : null,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, userId, pathname, version]);

  // Joined or left a room anywhere, or the current room finished/closed.
  useEffect(() => {
    const channel = supabase
      .channel(`active-battle:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "battle_room_members", filter: `user_id=eq.${userId}` },
        recheck
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "battle_rooms" }, (payload) => {
        const id =
          (payload.new as { id?: string } | null)?.id ?? (payload.old as { id?: string } | null)?.id;
        if (id && id === battle?.roomId) recheck();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, battle?.roomId]);

  if (!battle || pathname === `/battle/${battle.roomId}`) return null;

  const inProgress = battle.status === "in_progress";
  const vs = battle.opponentName ? ` with ${battle.opponentName}` : "";
  const leaveLabel = inProgress ? "Forfeit" : battle.isHost ? "Close room" : "Leave";

  return (
    <div role="status" className="border-t border-iron bg-the-red text-iron">
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
        <p className="min-w-0 flex-1 text-body-sm">
          {inProgress
            ? `Your battle${vs} is still going.`
            : `You're still in a battle room${vs}.`}
        </p>
        <div className="flex shrink-0 gap-2">
          <LinkButton href={`/battle/${battle.roomId}`} className="btn btn-primary btn-xs">
            Rejoin
          </LinkButton>
          <form
            action={async () => {
              await leaveBattleFromBanner(battle.roomId);
              recheck();
            }}
          >
            <SubmitButton
              className="btn btn-outline btn-xs border-iron text-iron"
              pendingText="Leaving…"
              confirmText={
                inProgress
                  ? "Forfeit the battle? Your opponent will win."
                  : battle.isHost
                    ? "Close this room for everyone?"
                    : undefined
              }
            >
              {leaveLabel}
            </SubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}
