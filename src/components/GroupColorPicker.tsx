"use client";

import { useState } from "react";
import { GROUP_COLOR_PRESETS } from "@/lib/study/groupColors";

/**
 * A hidden `color` field plus a preset swatch grid and a custom color input.
 * Drop into any `<form>` that already posts a `name` field for a group.
 */
export default function GroupColorPicker({ defaultColor }: { defaultColor?: string | null }) {
  const [color, setColor] = useState(defaultColor ?? "");

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="color" value={color} />
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          title="No color"
          onClick={() => setColor("")}
          className={`h-6 w-6 rounded-full border-2 grid place-items-center text-xs ${
            color === "" ? "border-primary" : "border-base-300"
          }`}
        >
          ×
        </button>
        {GROUP_COLOR_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            title={preset.name}
            aria-label={preset.name}
            onClick={() => setColor(preset.value)}
            className={`h-6 w-6 rounded-full border-2 ${
              color === preset.value ? "border-primary" : "border-transparent"
            }`}
            style={{ backgroundColor: preset.value }}
          />
        ))}
        <label
          title="Custom color"
          className="relative h-6 w-6 rounded-full border-2 border-base-300 overflow-hidden cursor-pointer grid place-items-center"
          style={color && !GROUP_COLOR_PRESETS.some((p) => p.value === color) ? { backgroundColor: color } : undefined}
        >
          {!color || GROUP_COLOR_PRESETS.some((p) => p.value === color) ? (
            <span className="text-xs">🎨</span>
          ) : null}
          <input
            type="color"
            value={color || "#888888"}
            onChange={(e) => setColor(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
      </div>
    </div>
  );
}
