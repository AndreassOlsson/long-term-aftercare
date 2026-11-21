"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { draftCheckup, sendCheckup } from "@/lib/assessment";
import { formatDate } from "@/lib/dates";

type Picture = { key: string; date: string };

const big = "flex min-h-14 w-full items-center justify-center rounded-2xl px-5 py-3 text-lg font-semibold disabled:opacity-50";

const STEPS = ["Reading your last weeks", "Finding what changed and since when", "Writing it up for the clinic"];

export function RequestEditor({
  raisedBy,
  pictures,
}: {
  raisedBy: "patient" | "suggested";
  /** Every picture in her record, for choosing what to attach. */
  pictures: Picture[];
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState(0);
  const [madeBy, setMadeBy] = useState<"claude" | "dummy" | null>(null);
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The agent reports no progress while it works, so the lines advance on a clock; the draft
    // appears the moment it is really done.
    const timers = [setTimeout(() => setStep(1), 1500), setTimeout(() => setStep(2), 4000)];
    draftCheckup()
      .then((draft) => {
        if (cancelled) return;
        if (draft) {
          setHeadline(draft.headline);
          setBody(draft.body);
          setDates(draft.evidenceDates);
          setChosen(draft.images);
          setMadeBy(draft.madeBy);
        } else {
          setBody("");
          setError("I could not prepare a draft just now. You can write the request yourself below.");
        }
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setError("I could not prepare a draft just now. You can write the request yourself below.");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  async function send() {
    setBusy(true);
    setError(null);
    const result = await sendCheckup({ headline: headline || "Patient asks for a check-up", body, evidenceDates: dates, images: chosen, raisedBy });
    setBusy(false);
    if (result.status === "sent") router.push(`/patient/clinic/${result.id}?sent=1`);
    else setError(result.message);
  }

  if (!loaded) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Preparing your request</h1>
        <Card>
          <ol className="flex flex-col gap-4" role="status" aria-live="polite">
            {STEPS.map((label, i) => (
              <li key={label} className={`flex items-center gap-3 ${i > step ? "text-muted" : ""}`}>
                <span aria-hidden="true" className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${i < step ? "bg-accent text-accent-ink" : i === step ? "animate-pulse border-2 border-accent" : "border border-line"}`}>
                  {i < step ? "✓" : ""}
                </span>
                <span className={i === step ? "font-medium" : ""}>
                  {label}
                  {i === step ? "…" : ""}
                </span>
              </li>
            ))}
          </ol>
        </Card>
        <p className="text-sm text-muted">Nothing is sent. You read it and change it first.</p>
      </>
    );
  }

  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ask for a check-up</h1>
        <Link href="/patient/clinic" className="min-h-11 content-center text-accent underline underline-offset-2">
          Cancel
        </Link>
      </header>
      <p className="text-muted">
        This is what the clinic will read. Change anything you like; nothing is sent until you press the button.
        {madeBy && (madeBy === "claude" ? " Drafted by Claude from your record." : " Drafted by the built-in stand-in from your record, not the AI.")}
      </p>

      <label className="flex flex-col gap-1 font-medium">
        In one line
        <input value={headline} onChange={(e) => setHeadline(e.target.value)} className="min-h-12 rounded-xl border border-line bg-surface px-3 text-base font-normal" />
      </label>
      <label className="flex flex-col gap-1 font-medium">
        What has changed
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="rounded-xl border border-line bg-surface p-3 text-base font-normal" />
      </label>

      {dates.length > 0 && (
        <section>
          <h2 className="font-medium">The days this rests on</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {dates.map((d) => (
              <li key={d} className="flex items-center rounded-full border border-line bg-surface pl-3">
                <Link href={`/patient/history?day=${d}`} className="min-h-11 content-center text-accent underline underline-offset-2">
                  {formatDate(d)}
                </Link>
                <button type="button" onClick={() => setDates((cur) => cur.filter((x) => x !== d))} aria-label={`Leave out ${formatDate(d)}`} className="min-h-11 px-3">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pictures.length > 0 && (
        <section>
          <h2 className="font-medium">Pictures to attach</h2>
          <ul className="mt-2 flex flex-wrap gap-3">
            {pictures.map((p) => {
              const on = chosen.includes(p.key);
              return (
                <li key={p.key}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setChosen((cur) => (on ? cur.filter((k) => k !== p.key) : cur.length < 3 ? [...cur, p.key] : cur))}
                    className={`relative block overflow-hidden rounded-xl border-2 ${on ? "border-accent" : "border-line"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/images?key=${encodeURIComponent(p.key)}`} alt={`Picture from ${formatDate(p.date)}`} className="h-24 w-28 object-cover" />
                    <span className="absolute inset-x-0 bottom-0 bg-surface/90 py-0.5 text-center text-xs">{on ? "✓ " : ""}{formatDate(p.date)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-sm text-muted">Up to three.</p>
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-warn bg-warn-soft p-3 text-warn">
          {error}
        </p>
      )}
      <button type="button" onClick={send} disabled={busy || !body.trim()} className={`${big} bg-accent text-accent-ink`}>
        {busy ? "Sending…" : "Send to the clinic"}
      </button>
    </>
  );
}
