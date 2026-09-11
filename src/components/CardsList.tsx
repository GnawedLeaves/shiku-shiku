"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteCard } from "@/lib/actions/cards";
import { copyCardsIntoSet } from "@/lib/actions/sets";
import { formatAnswer } from "@/lib/study/formatAnswer";
import type { AnswerDisplayMode } from "@/lib/supabase/database.types";

interface CardRow {
  id: string;
  group_id: string | null;
  question: string;
  answer_hiragana: string | null;
  answer_romaji: string | null;
}

interface GroupRow {
  id: string;
  name: string;
}

export default function CardsList({
  setId,
  cards,
  groups,
  answerMode,
  otherSets,
}: {
  setId: string;
  cards: CardRow[];
  groups: GroupRow[];
  answerMode: AnswerDisplayMode;
  otherSets: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetSetId, setTargetSetId] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggle(cardId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  function handleDelete(cardId: string) {
    if (!confirm("Delete this card?")) return;
    startTransition(async () => {
      await deleteCard(setId, cardId);
      router.refresh();
    });
  }

  function handleCopy() {
    if (!targetSetId || selected.size === 0) return;
    startTransition(async () => {
      await copyCardsIntoSet(Array.from(selected), targetSetId);
      setSelected(new Set());
      router.refresh();
    });
  }

  const grouped = groups.map((g) => ({ group: g, cards: cards.filter((c) => c.group_id === g.id) }));
  const ungrouped = cards.filter((c) => !c.group_id);

  function renderCard(card: CardRow) {
    return (
      <div key={card.id} className="flex items-center gap-2 py-2 border-b border-base-200 last:border-b-0">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={selected.has(card.id)}
          onChange={() => toggle(card.id)}
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{card.question}</p>
          <p className="text-sm opacity-70 truncate">{formatAnswer(card, answerMode)}</p>
        </div>
        <Link href={`/sets/${setId}/cards/${card.id}/edit`} className="btn btn-ghost btn-xs">
          Edit
        </Link>
        <button
          type="button"
          className="btn btn-ghost btn-xs text-error"
          disabled={isPending}
          onClick={() => handleDelete(card.id)}
        >
          Delete
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {grouped
        .filter((g) => g.cards.length > 0)
        .map(({ group, cards: groupCards }) => (
          <div key={group.id} className="card bg-base-100 shadow-sm">
            <div className="card-body p-4">
              <h3 className="font-semibold text-sm opacity-70">{group.name}</h3>
              {groupCards.map(renderCard)}
            </div>
          </div>
        ))}

      {ungrouped.length > 0 && (
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <h3 className="font-semibold text-sm opacity-70">Ungrouped</h3>
            {ungrouped.map(renderCard)}
          </div>
        </div>
      )}

      {cards.length === 0 && (
        <div className="alert">
          <span>No cards yet. Add one manually or import from a sheet.</span>
        </div>
      )}

      {otherSets.length > 0 && (
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4 gap-2">
            <h3 className="font-semibold text-sm">Copy selected cards to another set</h3>
            <p className="text-xs opacity-60">{selected.size} card(s) selected</p>
            <div className="flex gap-2">
              <select
                className="select select-bordered select-sm flex-1"
                value={targetSetId}
                onChange={(e) => setTargetSetId(e.target.value)}
              >
                <option value="">Choose a set...</option>
                {otherSets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={isPending || selected.size === 0 || !targetSetId}
                onClick={handleCopy}
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
