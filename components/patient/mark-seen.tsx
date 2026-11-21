"use client";

import { useEffect } from "react";
import { markSeen } from "./seen";

/** Opening an answer is what makes it no longer new. */
export function MarkSeen({ id, updatedAt }: { id: string; updatedAt: string }) {
  useEffect(() => markSeen(id, updatedAt), [id, updatedAt]);
  return null;
}
