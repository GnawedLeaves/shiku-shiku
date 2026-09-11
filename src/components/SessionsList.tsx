"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSession } from "@/lib/actions/sessions";

interface SessionRow {
  id: string;
  name: string | null;
  status: string;
  current_index: number;
  queueLength: number;
}

export default function SessionsList({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (sessions.length === 0) {
    return <p className="text-sm opacity-60">No sessions in progress.</p>;
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this session? Progress within it will be lost.")) return;
    startTransition(async () => {
      await deleteSession(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {sessions.map((s) => (
        <div
          key={s.id}
          className="flex items-center justify-between gap-2 bg-base-100 rounded-box p-3 shadow-sm"
        >
          <div>
            <p className="font-medium">{s.name || "Untitled session"}</p>
            <p className="text-xs opacity-60">
              {s.status === "paused" ? "Paused" : "In progress"} — {s.current_index}/{s.queueLength}
            </p>
          </div>
          <div className="flex gap-1">
            <Link href={`/study/${s.id}`} className="btn btn-primary btn-xs">
              {s.status === "paused" ? "Resume" : "Continue"}
            </Link>
            <button
              className="btn btn-ghost btn-xs text-error"
              disabled={isPending}
              onClick={() => handleDelete(s.id)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
