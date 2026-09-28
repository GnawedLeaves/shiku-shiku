"use client";

import { useState } from "react";
import GroupColorPicker from "@/components/GroupColorPicker";

export interface NewGroupDraft {
  name: string;
  color: string | null;
}

/**
 * "+ New group" toggle that opens a name field and colour swatches. The group
 * isn't created here -- it's created together with the card(s) on save, so an
 * abandoned form never leaves an empty group behind.
 *
 * Inside a <form> it posts `new_group_name` / `new_group_color`; outside one,
 * read the draft through `onChange`.
 */
export default function NewGroupField({
  onChange,
  plural = false,
}: {
  onChange?: (draft: NewGroupDraft | null) => void;
  /** Word the hint for several cards (PDF import) rather than one. */
  plural?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);

  function update(nextName: string, nextColor: string | null) {
    setName(nextName);
    setColor(nextColor);
    onChange?.(nextName.trim() ? { name: nextName.trim(), color: nextColor } : null);
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-xs self-start"
        onClick={() => setOpen(true)}
      >
        + New group
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 border border-iron p-3">
      <div className="flex items-center gap-2">
        <input
          name="new_group_name"
          value={name}
          onChange={(e) => update(e.target.value, color)}
          placeholder="New group name"
          className="input input-bordered input-sm flex-1 min-w-0"
          autoFocus
        />
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => {
            update("", null);
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>
      <GroupColorPicker
        fieldName="new_group_color"
        onChange={(value) => update(name, value || null)}
      />
      <span className="text-xs opacity-60">
        {name.trim()
          ? `“${name.trim()}” will be created when you save, with the new card${plural ? "s" : ""} in it.`
          : "Name the group to create it when you save."}
      </span>
    </div>
  );
}
