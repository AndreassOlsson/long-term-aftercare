"use client";

import { useEffect, useState } from "react";

const KEY = "lta-large-text";

/** Larger text for the whole app, remembered on this phone. */
export function TextSize() {
  const [large, setLarge] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved choice is only known in the browser
      setLarge(window.localStorage.getItem(KEY) === "1");
    } catch {
      /* not remembered */
    }
  }, []);
  function toggle() {
    const next = !large;
    setLarge(next);
    document.documentElement.style.fontSize = next ? "20px" : "";
    try {
      window.localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* not remembered */
    }
  }
  return (
    <button type="button" role="switch" aria-checked={large} onClick={toggle} className="flex min-h-12 w-full items-center justify-between rounded-xl border border-line bg-surface px-4">
      Larger text
      <span className={`rounded-full px-3 py-0.5 text-sm ${large ? "bg-accent text-accent-ink" : "bg-page text-muted"}`}>{large ? "On" : "Off"}</span>
    </button>
  );
}

/** Applies the saved choice as early as the shell mounts. */
export function ApplyTextSize() {
  useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) === "1") document.documentElement.style.fontSize = "20px";
    } catch {
      /* default size */
    }
  }, []);
  return null;
}
