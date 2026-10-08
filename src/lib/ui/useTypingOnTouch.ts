"use client";

import { useEffect, useState } from "react";

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === "TEXTAREA") return true;
  if (target.tagName !== "INPUT") return false;
  const type = (target as HTMLInputElement).type;
  return !["checkbox", "radio", "button", "submit", "range", "color", "file"].includes(type);
}

/**
 * True while a text field is focused on a touch device -- i.e. the on-screen
 * keyboard is (about to be) up. Used to get fixed UI like the bottom nav out
 * of the way so the keyboard doesn't squeeze what the user is typing into.
 */
export function useTypingOnTouch(): boolean {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const touch = window.matchMedia("(pointer: coarse)");
    const onFocusIn = (event: FocusEvent) => setTyping(touch.matches && isTextField(event.target));
    // focusout fires before focus lands on the next field; re-check after it.
    const onFocusOut = () =>
      window.setTimeout(
        () => setTyping(touch.matches && isTextField(document.activeElement)),
        0
      );
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return typing;
}
