"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { acceptBattleInvite, declineBattleInvite } from "@/lib/actions/battle";
import SubmitButton from "@/components/ui/SubmitButton";

interface Invite {
  id: string;
  fromName: string;
}

const OnlineContext = createContext<ReadonlySet<string>>(new Set());

/** Ids of everyone currently online in the app (from Supabase Presence). */
export function useOnlineUsers(): ReadonlySet<string> {
  return useContext(OnlineContext);
}

/** Invites older than this aren't popped up when the app is opened. */
const INVITE_FRESH_MS = 10 * 60 * 1000;

/**
 * App-wide realtime: marks the signed-in user as online (so friends see a
 * green dot) and drops a notification from the top of the screen when someone
 * invites them to a battle.
 */
export default function RealtimeProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [online, setOnline] = useState<ReadonlySet<string>>(new Set());
  const [invites, setInvites] = useState<Invite[]>([]);

  // Presence: one shared channel, keyed by user id.
  useEffect(() => {
    const channel = supabase.channel("online-users", {
      config: { presence: { key: userId } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        setOnline(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ since: Date.now() });
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  // Battle invites: new ones arrive live; recent ones are shown on load too.
  useEffect(() => {
    let cancelled = false;

    async function show(rows: { id: string; from_user: string }[]) {
      if (rows.length === 0) return;
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", Array.from(new Set(rows.map((row) => row.from_user))));
      const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
      if (cancelled) return;
      setInvites((current) => {
        const known = new Set(current.map((invite) => invite.id));
        const added = rows
          .filter((row) => !known.has(row.id))
          .map((row) => ({ id: row.id, fromName: nameById.get(row.from_user) ?? "A friend" }));
        return [...current, ...added];
      });
    }

    supabase
      .from("battle_invites")
      .select("id, from_user")
      .eq("to_user", userId)
      .eq("status", "pending")
      .gte("created_at", new Date(Date.now() - INVITE_FRESH_MS).toISOString())
      .order("created_at")
      .then(({ data }) => show(data ?? []));

    const channel = supabase
      .channel(`battle-invites:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "battle_invites",
          filter: `to_user=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { id: string; from_user: string; status: string };
          if (row.status === "pending") show([row]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  const dismiss = (id: string) => setInvites((current) => current.filter((i) => i.id !== id));
  const invite = invites[0];

  return (
    <OnlineContext.Provider value={online}>
      {children}

      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <AnimatePresence>
          {invite && (
            <motion.div
              key={invite.id}
              role="alertdialog"
              aria-label="Battle invite"
              initial={{ y: -120, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -120, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="pointer-events-auto flex w-full max-w-md flex-col gap-3 border border-iron bg-concrete p-4"
            >
              <p className="text-body-sm">
                <span className="text-subheading block">Battle invite</span>
                {invite.fromName} wants to battle you. Accept?
              </p>
              <div className="flex gap-2">
                <form action={acceptBattleInvite.bind(null, invite.id)} className="flex-1">
                  <SubmitButton className="btn btn-primary btn-sm w-full" pendingText="Joining…">
                    Accept
                  </SubmitButton>
                </form>
                <form
                  action={async () => {
                    dismiss(invite.id);
                    await declineBattleInvite(invite.id);
                  }}
                  className="flex-1"
                >
                  <SubmitButton className="btn btn-outline btn-sm w-full" pendingText="…">
                    Decline
                  </SubmitButton>
                </form>
              </div>
              {invites.length > 1 && (
                <p className="text-xs opacity-60">+{invites.length - 1} more invite(s)</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </OnlineContext.Provider>
  );
}
