"use client";

import { useOnlineUsers } from "@/components/realtime/RealtimeProvider";

/** A small status dot: filled when the person is in the app right now. */
export default function OnlineDot({ userId, className = "" }: { userId: string; className?: string }) {
  const online = useOnlineUsers().has(userId);
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full border ${
        online ? "border-success bg-success" : "border-iron/40 bg-transparent"
      } ${className}`}
      title={online ? "Online" : "Offline"}
      role="img"
      aria-label={online ? "Online" : "Offline"}
    />
  );
}
