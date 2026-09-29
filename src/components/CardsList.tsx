"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCard, deleteCards } from "@/lib/actions/cards";
import { copyCardsIntoSet } from "@/lib/actions/sets";
import {
  createGroupWithCards,
  removeCardsFromGroup,
  updateCardGroups,
} from "@/lib/actions/groups";
import { formatAnswer } from "@/lib/study/formatAnswer";
import { GROUP_COLOR_PRESETS } from "@/lib/study/groupColors";
import GroupBadge from "@/components/GroupBadge";
import type { AnswerDisplayMode } from "@/lib/supabase/database.types";
import LinkButton from "@/components/ui/LinkButton";

interface CardRow {
  id: string;
  question: string;
  answer_hiragana: string | null;
  answer_romaji: string | null;
  created_at: string;
  groupIds: string[];
}

interface GroupRow {
  id: string;
  name: string;
  color?: string | null;
}

type Filter = { kind: "all" } | { kind: "ungrouped" } | { kind: "group"; id: string };

/** How many of the selected cards are in a group: all, some, or none of them. */
type Membership = "all" | "some" | "none";

/** Groups the user changed in the dialog; untouched groups are in neither list. */
interface GroupChanges {
  add: string[];
  remove: string[];
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
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [sort, setSort] = useState<"oldest" | "newest">("oldest");
  const [search, setSearch] = useState("");
  const [isTagOpen, setIsTagOpen] = useState(false);
  const [targetSetId, setTargetSetId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Which button started the running action, so only that one shows a spinner
  // (the rest are just disabled until it finishes).
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const isRunning = (action: string) => isPending && activeAction === action;

  const groupNames = useMemo(
    () => Object.fromEntries(groups.map((group) => [group.id, group.name])),
    [groups]
  );
  const groupById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);

  const visibleCards = useMemo(() => {
    const filtered =
      filter.kind === "all"
        ? cards
        : filter.kind === "ungrouped"
          ? cards.filter((card) => card.groupIds.length === 0)
          : cards.filter((card) => card.groupIds.includes(filter.id));
    // Matches the English question first and foremost, but kana and romaji too,
    // so "taberu" or "たべる" also finds "to eat".
    const term = search.trim().toLowerCase();
    const searched = term
      ? filtered.filter((card) =>
          [card.question, card.answer_hiragana, card.answer_romaji].some((field) =>
            field?.toLowerCase().includes(term)
          )
        )
      : filtered;
    // ISO timestamps compare correctly as strings; ties keep their DB order.
    const direction = sort === "oldest" ? 1 : -1;
    return [...searched].sort((a, b) => direction * a.created_at.localeCompare(b.created_at));
  }, [cards, filter, sort, search]);

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

  function run(action: string, work: () => Promise<unknown>) {
    setError(null);
    setActiveAction(action);
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
    run(`delete:${cardId}`, async () => {
      await deleteCard(setId, cardId);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(cardId);
        return next;
      });
    });
  }

  // Where the selected cards currently stand in each group, so the dialog can
  // open with their existing groups already ticked.
  const membership = useMemo(() => {
    const selectedCards = cards.filter((card) => selected.has(card.id));
    return Object.fromEntries(
      groups.map((group) => {
        const inGroup = selectedCards.filter((card) => card.groupIds.includes(group.id)).length;
        const state: Membership =
          inGroup === 0 ? "none" : inGroup === selectedCards.length ? "all" : "some";
        return [group.id, state];
      })
    ) as Record<string, Membership>;
  }, [cards, groups, selected]);

  const anySelectedGrouped = Object.values(membership).some((state) => state !== "none");

  function handleSaveGroups(changes: GroupChanges) {
    if (selectedIds.length === 0) return;
    run("save-groups", async () => {
      await updateCardGroups(setId, selectedIds, changes.add, changes.remove);
      setIsTagOpen(false);
      setSelected(new Set());
    });
  }

  function handleCreateGroup(name: string, color: string | null, changes: GroupChanges) {
    run("create-group", async () => {
      // Keep any ticks/unticks made in the dialog before creating the new group.
      if (changes.add.length > 0 || changes.remove.length > 0) {
        await updateCardGroups(setId, selectedIds, changes.add, changes.remove);
      }
      await createGroupWithCards(setId, name, selectedIds, color);
      setIsTagOpen(false);
      setSelected(new Set());
    });
  }

  function handleRemoveFromGroup(groupId: string) {
    run("remove-from-group", async () => {
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
    run("delete-selected", async () => {
      await deleteCards(setId, selectedIds);
      setSelected(new Set());
    });
  }

  function handleCopy() {
    if (!targetSetId || selectedIds.length === 0) return;
    run("copy", async () => {
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

      <label className="input input-bordered flex items-center gap-2 w-full">
        <span className="opacity-60 text-sm" aria-hidden="true">
          Search
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="English word, kana or romaji"
          className="grow min-w-0"
          aria-label="Search cards in this set"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {search && (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => setSearch("")}
            aria-label="Clear search"
          >
            Clear
          </button>
        )}
      </label>

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
        <div className="flex items-center gap-3">
          <span className="text-xs opacity-60">{selected.size} selected</span>
          <select
            className="select select-bordered select-xs w-auto"
            value={sort}
            onChange={(e) => setSort(e.target.value as "oldest" | "newest")}
            aria-label="Sort cards by date added"
          >
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
          </select>
        </div>
      </div>

      <div className="card bg-base-100">
        <div className="card-body p-2">
          {visibleCards.length === 0 && (
            <p className="text-sm opacity-60 p-2">
              {search.trim()
                ? `No cards match “${search.trim()}”${filter.kind === "all" ? "" : " in this filter"}.`
                : "No cards in this group yet."}
            </p>
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
              <LinkButton href={`/sets/${setId}/cards/${card.id}/edit`} className="btn btn-ghost btn-xs">
                Edit
              </LinkButton>
              <button
                type="button"
                className="btn btn-ghost btn-xs text-error"
                disabled={isPending}
                onClick={() => handleDelete(card.id)}
              >
                {isRunning(`delete:${card.id}`) && <span className="loading loading-spinner loading-xs" />}
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Actions for the current selection */}
      {selected.size > 0 && (
        <div className="card bg-base-100 sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 border border-iron">
          <div className="card-body p-3 gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{selected.size} card(s) selected</span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={isPending}
                onClick={() => setIsTagOpen(true)}
              >
                {anySelectedGrouped ? "Manage groups" : "Add to group"}
              </button>
              {filter.kind === "group" && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={isPending}
                  onClick={() => handleRemoveFromGroup(filter.id)}
                >
                  {isRunning("remove-from-group") && <span className="loading loading-spinner loading-xs" />}
                  Remove from {groupNames[filter.id]}
                </button>
              )}
              <button
                type="button"
                className="btn btn-outline btn-sm text-error border-error/40 hover:bg-error hover:text-error-content"
                disabled={isPending}
                onClick={handleDeleteSelected}
              >
                {isRunning("delete-selected") && <span className="loading loading-spinner loading-xs" />}
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
                  {isRunning("copy") && <span className="loading loading-spinner loading-xs" />}
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
          membership={membership}
          selectedCount={selected.size}
          isPending={isPending}
          pendingAction={isPending ? activeAction : null}
          onClose={() => setIsTagOpen(false)}
          onSave={handleSaveGroups}
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
  membership,
  selectedCount,
  isPending,
  pendingAction,
  onClose,
  onSave,
  onCreate,
}: {
  groups: GroupRow[];
  membership: Record<string, Membership>;
  selectedCount: number;
  isPending: boolean;
  pendingAction: string | null;
  onClose: () => void;
  onSave: (changes: GroupChanges) => void;
  onCreate: (name: string, color: string | null, changes: GroupChanges) => void;
}) {
  // Starts as the cards' current membership; the diff against it is what saves.
  const [draft, setDraft] = useState<Record<string, Membership>>(membership);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState<string | null>(null);

  const changes: GroupChanges = { add: [], remove: [] };
  for (const group of groups) {
    const next = draft[group.id];
    if (next === membership[group.id]) continue;
    if (next === "all") changes.add.push(group.id);
    else if (next === "none") changes.remove.push(group.id);
  }
  const changeCount = changes.add.length + changes.remove.length;

  /**
   * Ticked -> unticked -> ticked. A group only some of the cards are in gets a
   * third "leave as is" stop, so mixed selections can be restored untouched.
   */
  function cycle(groupId: string) {
    setDraft((prev) => {
      const current = prev[groupId];
      const next: Membership =
        current === "some"
          ? "all"
          : current === "all"
            ? "none"
            : membership[groupId] === "some"
              ? "some"
              : "all";
      return { ...prev, [groupId]: next };
    });
  }

  const cardsLabel = selectedCount === 1 ? "this card" : `these ${selectedCount} cards`;

  return (
    <div className="modal modal-open" role="dialog">
      <div className="modal-box">
        <h3 className="font-bold text-lg">Groups</h3>
        <p className="text-sm opacity-60 mb-3">
          Tick to add {cardsLabel}, untick to remove. A dash means only some of them are in
          that group — leave it to keep things as they are.
        </p>

        <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
          {groups.length === 0 && <p className="text-sm opacity-60">No groups yet — create one below.</p>}
          {groups.map((group) => (
            <label key={group.id} className="label cursor-pointer justify-start gap-3">
              <TriStateCheckbox state={draft[group.id]} onChange={() => cycle(group.id)} />
              {group.color && (
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: group.color }}
                  aria-hidden="true"
                />
              )}
              <span className="label-text">{group.name}</span>
              {draft[group.id] !== membership[group.id] && (
                <span className="text-xs opacity-60 ml-auto">
                  {draft[group.id] === "all" ? "will add" : draft[group.id] === "none" ? "will remove" : ""}
                </span>
              )}
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
              onClick={() => onCreate(newGroupName, newGroupColor, changes)}
            >
              {pendingAction === "create-group" && <span className="loading loading-spinner loading-xs" />}
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
                className={`h-5 w-5 rounded-full ${
                  newGroupColor === preset.value ? "ring-2 ring-iron ring-offset-2 ring-offset-concrete" : ""
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
            disabled={isPending || changeCount === 0}
            onClick={() => onSave(changes)}
          >
            {pendingAction === "save-groups" && <span className="loading loading-spinner loading-xs" />}
            Save
          </button>
        </div>
      </div>
      <button type="button" className="modal-backdrop" onClick={onClose} aria-label="Close" />
    </div>
  );
}

/** A checkbox that can also show a dash, for "some of the selected cards". */
function TriStateCheckbox({ state, onChange }: { state: Membership; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);

  // `indeterminate` has no HTML attribute; it can only be set as a DOM property.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className="checkbox checkbox-sm"
      checked={state === "all"}
      aria-checked={state === "some" ? "mixed" : state === "all"}
      onChange={onChange}
    />
  );
}
