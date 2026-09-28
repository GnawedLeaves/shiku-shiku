"use client";

import { useRef, useState } from "react";

/** A read-only value with a Copy pill beside it. */
export default function CopyField({
  label,
  value,
  large = false,
}: {
  label: string;
  value: string;
  large?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // The Clipboard API needs a secure context (https / localhost); on a LAN
      // address fall back to selecting the text and the legacy copy command.
      inputRef.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="label-text text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className={`input input-bordered flex-1 min-w-0 ${
            large ? "text-subheading tracking-widest" : "input-sm"
          }`}
        />
        <button
          type="button"
          onClick={copy}
          className="btn btn-primary btn-sm shrink-0 min-w-20"
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </label>
  );
}
