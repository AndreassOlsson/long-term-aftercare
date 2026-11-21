import { storageKind } from "./storage";

/** A warning to show when entries would not survive, or null when all is well. */
export function storageNotice(): string | null {
  return storageKind() === "temporary"
    ? "No Blob store is connected to this deployment, so new entries and pictures will disappear again. Connect one in the Vercel project under Storage."
    : null;
}
