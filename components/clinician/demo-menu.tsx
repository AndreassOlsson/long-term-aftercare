"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// The demo tools: put the stored data back to the start, or drop in a sample
// check-up request when the patient's side is not being used.
export function DemoMenu() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function call(url: string, confirmText: string | null, done: (data: { removed?: number }) => string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) throw new Error(`${res.status}`);
      setMessage(done(await res.json()));
      router.push("/doctor");
      router.refresh();
    } catch {
      setMessage("That did not work. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-page">Demo tools</summary>
      <div className="absolute right-0 z-20 mt-1 w-72 rounded-xl border border-line bg-surface p-3 shadow-lg">
        <button
          disabled={busy}
          onClick={() => call("/api/demo/request", null, () => "Sample request added to the inbox.")}
          className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-page disabled:opacity-50"
        >
          <span className="font-medium">Add a sample request</span>
          <span className="block text-xs text-muted">For when the patient&apos;s phone is not in use.</span>
        </button>
        <button
          disabled={busy}
          onClick={() =>
            call(
              "/api/demo/reset",
              "Reset all stored data to the starting state? Entries, pictures and requests saved so far are removed.",
              (d) => `Reset done (${d.removed ?? 0} stored items removed).`,
            )
          }
          className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-page disabled:opacity-50"
        >
          <span className="font-medium text-alert">Reset to the starting state</span>
          <span className="block text-xs text-muted">Removes everything saved since the demo began.</span>
        </button>
        {message && (
          <p role="status" className="mt-2 border-t border-line px-2 pt-2 text-xs text-muted">
            {message}
          </p>
        )}
      </div>
    </details>
  );
}
