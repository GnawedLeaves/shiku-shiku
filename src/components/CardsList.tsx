"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteCard, deleteCards } from "@/lib/actions/cards";
import { copyCardsIntoSet } from "@/lib/actions/sets";
import {
  addCardsToGroups,
  createGroupWithCards,
  removeCardsFromGroup,
} from "@/lib/actions/groups";
import { formatAnswer } from "@/lib/study/formatAnswer";
import { GROUP_COLOR_PRESETS } from "@/lib/study/groupColors";
import GroupBadge from "@/components/GroupBadge";
import type { AnswerDisplayMode } from "@/lib/supabase/database.types";

interface CardRow {
  id: string;
  question: string;
  answer_hiragana: string | null;
  answer_romaji: string | null;
  groupIds: string[];
}

interface GroupRow {
  id: string;
  name: string;
  color?: string | null;
}

type Filter = { kind: "all" } | { kind: "ungrouped" } | { kind: "group"; id: string };

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
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [isTagOpen, setIsTagOpen] = useState(false);
  const [targetSetId, setTargetSetId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const groupNames = useMemo(
    () => Object.fromEntries(groups.map((group) => [group.id, group.name])),
    [groups]
  );
  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);

  const visibleCards = useMemo(() => {
    if (filter.kind === "all") return cards;
    if (filter.kind === "ungrouped") return cards.filter((card) => card.groupIds.length === 0);
    return cards.filter((card) => card.groupIds.includes(filter.id));
  }, [cards, filter]);

  const selectedIds = Array.from(selected);
  const allVisibleSelected =
    visibleCards.length > 0 && visibleCards.every((card) => selected.has(card.id));

  function toggle(cardId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleCards.forEach((card) => next.delete(card.id));
      else visibleCards.forEach((card) => next.add(card.id));
      return next;
    });
  }

  function run(work: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await work();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function handleDelete(cardId: string) {
    if (!confirm("Delete this card?")) return;
    run(async () => {
      await deleteCard(setId, cardId);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(cardId);
        return next;
      });
    });
  }

  function handleAddToGroups(groupIds: string[]) {
    if (selectedIds.length === 0 || groupIds.length === 0) return;
    run(async () => {
      await addCardsToGroups(setId, selectedIds, groupIds);
      setIsTagOpen(false);
      setSelected(new Set());
    });
  }

  function handleCreateGroup(name: string, color: string | null) {
    run(async () => {
      await createGroupWithCards(setId, name, selectedIds, color);
      setIsTagOpen(false);
      setSelected(new Set());
    });
  }

  function handleRemoveFromGroup(groupId: string) {
    run(async () => {
      await removeCardsFromGroup(setId, selectedIds, groupId);
      setSelected(new Set());
    });
  }

  function handleDeleteSelected() {
    if (selectedIds.length === 0) return;
    const confirmed = confirm(
      `Delete ${selectedIds.length} card${selectedIds.length === 1 ? "" : "s"}? This can't be undone.`
    );
    if (!confirmed) return;
    run(async () => {
      await deleteCards(setId, selectedIds);
      setSelected(new Set());
    });
  }

  function handleCopy() {
    if (!targetSetId || selectedIds.length === 0) return;
    run(async () => {
      await copyCardsIntoSet(selectedIds, targetSetId);
      setSelected(new Set());
      setTargetSetId("");
    });
  }

  if (cards.length === 0) {
    return (
      <div className="alert">
        <span>No cards yet. Add one manually or import from a PDF.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <div className="alert alert-error text-sm py-2">{error}</div>}

      {/* Filter by group (tag) */}
      <div className="flex flex-wrap gap-1">
        <FilterChip active={filter.kind === "all"} onClick={() => setFilter({ kind: "all" })}>
          All ({cards.length})
        </FilterChip>
        {groups.map((group) => {
          const count = cards.filter((card) => card.groupIds.includes(group.id)).length;
          return (
            <FilterChip
              key={group.id}
              active={filter.kind === "group" && filter.id === group.id}
              onClick={() => setFilter({ kind: "group", id: group.id })}
              color={group.color}
            >
              {group.name} ({count})
            </FilterChip>
          );
        })}
        <FilterChip
          active={filter.kind === "ungrouped"}
          onClick={() => setFilter({ kind: "ungrouped" })}
        >
          Ungrouped ({cards.filter((card) => card.groupIds.length === 0).length})
        </FilterChip>
      </div>

      <div className="flex items-center justify-between gap-2">
        <label className="label cursor-pointer gap-2 py-0">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={allVisibleSelected}
            onChange={toggleAllVisible}
          />
          <span className="label-text text-sm">Select all</span>
        </label>
        <span className="text-xs opacity-60">{selected.size} selected</span>
      </div>

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-2">
          {visibleCards.length === 0 && (
            <p className="text-sm opacity-60 p-2">No cards in this group yet.</p>
          )}
          {visibleCards.map((card) => (
            <div
              key={card.id}
              className="flex items-center gap-2 p-2 border-b border-base-200 last:border-b-0"
            >
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={selected.has(card.id)}
                onChange={() => toggle(card.id)}
                aria-label={`Select ${card.question}`}
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{card.question}</p>
                <p className="text-sm opacity-70 truncate">{formatAnswer(card, answerMode)}</p>
                {card.groupIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {card.groupIds.map((groupId) => (
                      <GroupBadge
                        key={groupId}
                        name={groupNames[groupId] ?? "?"}
                        color={groupById[groupId]?.color}
                      />
                    ))}
                  </div>
                )}
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
          ))}
        </div>
      </div>

      {/* Actions for the current selection */}
      {selected.size > 0 && (
        <div className="card bg-base-100 shadow-sm sticky bottom-20 z-10 border border-primary/20">
          <div className="card-body p-3 gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{selected.size} card(s) selected</span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={isPending}
                onClick={() => setIsTagOpen(true)}
              >
                {isPending && <span className="loading loading-spinner loading-xs" />}
                Add to group
              </button>
              {filter.kind === "group" && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={isPending}
                  onClick={() => handleRemoveFromGroup(filter.id)}
                >
                  Remove from {groupNames[filter.id]}
                </button>
              )}
              <button
                type="button"
                className="btn btn-outline btn-sm text-error border-error/40 hover:bg-error hover:text-error-content"
                disabled={isPending}
                onClick={handleDeleteSelected}
              >
                {isPending && <span className="loading loading-spinner loading-xs" />}
                Delete
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </button>
            </div>

            {otherSets.length > 0 && (
              <div className="flex gap-2">
                <select
                  className="select select-bordered select-sm flex-1"
                  value={targetSetId}
                  onChange={(e) => setTargetSetId(e.target.value)}
                >
                  <option value="">Copy to another set…</option>
                  {otherSets.map((set) => (
                    <option key={set.id} value={set.id}>
                      {set.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={isPending || !targetSetId}
                  onClick={handleCopy}
                >
                  Copy
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {isTagOpen && (
        <TagDialog
          groups={groups}
          isPending={isPending}
          onClose={() => setIsTagOpen(false)}
          onApply={handleAddToGroups}
          onCreate={handleCreateGroup}
        />
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color?: string | null;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn btn-xs gap-1.5 ${active ? "btn-primary" : "btn-ghost"}`}
    >
      {color && (
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}

function TagDialog({
  groups,
  isPending,
  onClose,
  onApply,
  onCreate,
}: {
  groups: GroupRow[];
  isPending: boolean;
  onClose: () => void;
  onApply: (groupIds: string[]) => void;
  onCreate: (name: string, color: string | null) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState<string | null>(null);

  return (
    <div className="modal modal-open" role="dialog">
      <div className="modal-box">
        <h3 className="font-bold text-lg">Add to group</h3>
        <p className="text-sm opacity-60 mb-3">
          A card can be in several groups — think of them as tags.
        </p>

        <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
          {groups.length === 0 && <p className="text-sm opacity-60">No groups yet — create one below.</p>}
          {groups.map((group) => (
            <label key={group.id} className="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={picked.has(group.id)}
                onChange={() =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    return next;
                  })
                }
              />
              {group.color && (
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: group.color }}
                  aria-hidden="true"
                />
              )}
              <span className="label-text">{group.name}</span>
            </label>
          ))}
        </div>

        <div className="divider my-2">or create a new one</div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="New group name"
              className="input input-bordered input-sm flex-1"
            />
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={isPending || !newGroupName.trim()}
              onClick={() => onCreate(newGroupName, newGroupColor)}
            >
              Create &amp; add
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {GROUP_COLOR_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                title={preset.name}
                aria-label={preset.name}
                onClick={() => setNewGroupColor((c) => (c === preset.value ? null : preset.value))}
                className={`h-5 w-5 rounded-full border-2 ${
                  newGroupColor === preset.value ? "border-primary" : "border-transparent"
                }`}
                style={{ backgroundColor: preset.value }}
              />
            ))}
          </div>
        </div>

        <div className="modal-action">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={isPending || picked.size === 0}
            onClick={() => onApply(Array.from(picked))}
          >
            {isPending && <span className="loading loading-spinner loading-xs" />}
            Add to {picked.size || ""} group{picked.size === 1 ? "" : "s"}
          </button>
        </div>
      </div>
      <button type="button" className="modal-backdrop" onClick={onClose} aria-label="Close" />
    </div>
  );
}
