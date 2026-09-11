"use client";

import { useMemo, useState } from "react";
import { createSession } from "@/lib/actions/sessions";

interface SetOption {
  id: string;
  name: string;
}

interface GroupOption {
  id: string;
  name: string;
}

const COUNT_PRESETS = ["10", "20", "50"] as const;

export default function StudySessionForm({
  sets,
  groupsBySetId,
  initialSetId,
}: {
  sets: SetOption[];
  groupsBySetId: Record<string, GroupOption[]>;
  initialSetId?: string;
}) {
  const [setId, setSetId] = useState(initialSetId && sets.some((s) => s.id === initialSetId) ? initialSetId : sets[0]?.id ?? "");
  const [mode, setMode] = useState<"all" | "random">("all");
  const [countPreset, setCountPreset] = useState<string>("10");
  const [customCount, setCustomCount] = useState<string>("15");
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());

  const groups = useMemo(() => groupsBySetId[setId] ?? [], [groupsBySetId, setId]);

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function handleSetChange(newSetId: string) {
    setSetId(newSetId);
    setSelectedGroupIds(new Set());
  }

  const resolvedCount = countPreset === "custom" ? customCount || "1" : countPreset;
  const groupsChosen = selectedGroupIds.size > 0;

  if (sets.length === 0) {
    return (
      <div className="alert">
        <span>Create a set with some cards first before starting a study session.</span>
      </div>
    );
  }

  return (
    <form action={createSession} className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        <label className="form-control">
          <span className="label-text mb-1">Set</span>
          <select
            name="set_id"
            value={setId}
            onChange={(e) => handleSetChange(e.target.value)}
            className="select select-bordered w-full"
          >
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {groups.length > 0 && (
          <div className="form-control">
            <span className="label-text mb-1">Study specific group(s) instead (optional)</span>
            <div className="flex flex-col gap-1">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="group_ids"
                    value={g.id}
                    checked={selectedGroupIds.has(g.id)}
                    onChange={() => toggleGroup(g.id)}
                    className="checkbox checkbox-sm"
                  />
                  <span>{g.name}</span>
                </label>
              ))}
            </div>
            {groupsChosen && (
              <p className="text-xs opacity-60 mt-1">
                Cards in each selected group will be shown together as a batch.
              </p>
            )}
          </div>
        )}

        {!groupsChosen && (
          <>
            <div className="form-control">
              <span className="label-text mb-1">Scope</span>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value="all"
                    checked={mode === "all"}
                    onChange={() => setMode("all")}
                    className="radio radio-sm radio-primary"
                  />
                  <span>All cards</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value="random"
                    checked={mode === "random"}
                    onChange={() => setMode("random")}
                    className="radio radio-sm radio-primary"
                  />
                  <span>Random sample</span>
                </label>
              </div>
            </div>

            {mode === "random" && (
              <div className="form-control">
                <span className="label-text mb-1">How many cards?</span>
                <div className="flex gap-2 flex-wrap items-center">
                  {COUNT_PRESETS.map((preset) => (
                    <button
                      type="button"
                      key={preset}
                      onClick={() => setCountPreset(preset)}
                      className={`btn btn-sm ${countPreset === preset ? "btn-primary" : "btn-outline"}`}
                    >
                      {preset}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCountPreset("custom")}
                    className={`btn btn-sm ${countPreset === "custom" ? "btn-primary" : "btn-outline"}`}
                  >
                    Custom
                  </button>
                  {countPreset === "custom" && (
                    <input
                      type="number"
                      min={1}
                      value={customCount}
                      onChange={(e) => setCustomCount(e.target.value)}
                      className="input input-bordered input-sm w-20"
                    />
                  )}
                </div>
              </div>
            )}
            <input type="hidden" name="count" value={mode === "random" ? resolvedCount : "all"} />
          </>
        )}

        <label className="form-control">
          <span className="label-text mb-1">Session name (optional)</span>
          <input name="name" className="input input-bordered w-full" placeholder="Evening review" />
        </label>

        <button type="submit" className="btn btn-primary mt-2">
          Start session
        </button>
      </div>
    </form>
  );
}
