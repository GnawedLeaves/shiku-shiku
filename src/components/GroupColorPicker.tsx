"use client";

import { useState } from "react";
import { GROUP_COLOR_PRESETS } from "@/lib/study/groupColors";

/**
 * A hidden `color` field plus a preset swatch grid and a custom color input.
 * Drop into any `<form>` that should post a `color` (groups, sets). An empty
 * value means "no colour" -- or, for sets, "pick one automatically".
 */
export default function GroupColorPicker({
  defaultColor,
  noneLabel = "No color",
  size = "sm",
}: {
  defaultColor?: string | null;
  noneLabel?: string;
  size?: "sm" | "lg";
}) {
  const [color, setColor] = useState(defaultColor ?? "");
  const swatch = size === "lg" ? "h-9 w-9" : "h-6 w-6";
  const ring = "ring-2 ring-iron ring-offset-2 ring-offset-concrete";
  const isCustom = color !== "" && !GROUP_COLOR_PRESETS.some((p) => p.value === color);

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="color" value={color} />
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          title={noneLabel}
          aria-label={noneLabel}
          onClick={() => setColor("")}
          className={`${swatch} rounded-full border-2 border-base-300 grid place-items-center text-xs ${
            color === "" ? ring : ""
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
            className={`${swatch} rounded-full ${
              color === preset.value ? ring : ""
            }`}
            style={{ backgroundColor: preset.value }}
          />
        ))}
        <label
          title="Custom color"
          aria-label="Custom color"
          className={`relative ${swatch} rounded-full border-2 border-base-300 overflow-hidden cursor-pointer grid place-items-center ${
            isCustom ? ring : ""
          }`}
          style={isCustom ? { backgroundColor: color } : undefined}
        >
          {!isCustom && <span className="text-sm leading-none">+</span>}
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
