"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSession } from "@/lib/actions/sessions";
import LinkButton from "@/components/ui/LinkButton";

interface SessionRow {
  id: string;
  name: string | null;
  status: string;
  current_index: number;
  queueLength: number;
  studyMode: "quiz" | "flashcards";
}

export default function SessionsList({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (sessions.length === 0) {
    return <p className="text-sm opacity-60">No sessions in progress.</p>;
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this session? Progress within it will be lost.")) return;
    setDeletingId(id);
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
          className="flex items-center justify-between gap-2 bg-base-100 rounded-box p-3"
        >
          <div>
            <p className="font-medium">{s.name || "Untitled session"}</p>
            <p className="text-xs opacity-60">
              {s.studyMode === "flashcards" ? "Flashcards · " : ""}
              {s.status === "paused" ? "Paused" : "In progress"} — {s.current_index}/{s.queueLength}
            </p>
          </div>
          <div className="flex gap-1">
            <LinkButton href={`/study/${s.id}`} className="btn btn-primary btn-xs">
              {s.status === "paused" ? "Resume" : "Continue"}
            </LinkButton>
            <button
              className="btn btn-ghost btn-xs text-error"
              disabled={isPending}
              onClick={() => handleDelete(s.id)}
            >
              {isPending && deletingId === s.id && <span className="loading loading-spinner loading-xs" />}
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
