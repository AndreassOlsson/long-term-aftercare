"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps a server-rendered screen current: asks for fresh data every few seconds
 * while the tab is showing, so a new request appears in the inbox without a reload.
 */
export function AutoRefresh({ seconds = 3 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(tick, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
