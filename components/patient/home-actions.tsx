"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeTodaysCheckin } from "@/lib/assessment";

const primary = "flex min-h-14 w-full items-center justify-center rounded-2xl bg-accent px-5 py-3 text-lg font-semibold text-accent-ink hover:opacity-90";
const quiet = "flex min-h-12 flex-1 items-center justify-center rounded-xl border border-line bg-surface px-4 font-medium";

/**
 * The one thing to do on the home page. Not yet checked in today: check in.
 * Checked in: it says so, and offers to correct today's entry or remove it.
 */
export function HomeActions({ checkedIn, mood }: { checkedIn: boolean; mood: string | null }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const result = await removeTodaysCheckin();
    setBusy(false);
    if (result.status === "removed") {
      setConfirm(false);
      router.refresh();
    } else setError(result.message);
  }

  if (!checkedIn) {
    return (
      <div className="flex flex-col gap-2" data-testid="home-action">
        <Link href="/patient/checkin" className={primary}>
          Check in
        </Link>
        <p className="text-center text-sm text-muted">About a minute. Say how it has been, in your own words or with a picture.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-testid="home-action">
      <div className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-accent bg-accent-soft px-5 py-3 text-lg font-semibold text-accent" data-testid="checked-in-today">
        <span aria-hidden="true">✓</span> You have checked in today
      </div>
      {mood && <p className="text-center text-sm text-muted">Today you said: {mood}.</p>}
      {confirm ? (
        <div role="alertdialog" aria-label="Remove today’s check-in" className="flex flex-col gap-2 rounded-2xl border border-alert bg-alert-soft p-3">
          <p className="text-sm">Remove today’s check-in? Its words, pictures and scores are taken out of your record and your history, as if you had not checked in today.</p>
          <div className="flex gap-2">
            <button type="button" onClick={remove} disabled={busy} className="min-h-12 flex-1 rounded-xl bg-alert px-4 font-semibold text-accent-ink disabled:opacity-50">
              {busy ? "Removing…" : "Yes, remove it"}
            </button>
            <button type="button" onClick={() => setConfirm(false)} disabled={busy} className="min-h-12 flex-1 rounded-xl border border-line bg-surface px-4 font-semibold">
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Link href="/patient/checkin" className={quiet}>
            Correct today’s entry
          </Link>
          <button type="button" onClick={() => setConfirm(true)} className={`${quiet} text-alert`}>
            Remove it
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-warn bg-warn-soft p-3 text-sm text-warn">
          {error}
        </p>
      )}
    </div>
  );
}
