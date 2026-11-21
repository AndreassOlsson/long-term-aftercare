"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { loadSuggestions } from "@/lib/assessment";
import { formatDate } from "@/lib/dates";
import type { SuggestionSet } from "@/lib/suggestions";
import { seenAnswers } from "./seen";

const primary =
  "flex min-h-14 w-full items-center justify-center rounded-2xl bg-accent px-5 py-3 text-lg font-semibold text-accent-ink hover:opacity-90";

export type MainChoice = { label: string; hint: string; href: string };

/** The one thing to do now. A fresh answer from the clinic comes before a new check-in. */
export function MainAction({
  answered,
  fallback,
}: {
  answered: { id: string; updatedAt: string; headline: string }[];
  fallback: MainChoice;
}) {
  const [choice, setChoice] = useState<MainChoice>(fallback);
  useEffect(() => {
    const seen = seenAnswers();
    const fresh = answered.find((a) => seen[a.id] !== a.updatedAt);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- what was already read is only known in the browser
    setChoice(fresh ? { label: "Read the clinic's answer", hint: fresh.headline, href: `/patient/clinic/${fresh.id}` } : fallback);
  }, [answered, fallback]);
  return (
    <div className="flex flex-col gap-2">
      <Link href={choice.href} className={primary}>
        {choice.label}
      </Link>
      <p className="text-center text-sm text-muted">{choice.hint}</p>
    </div>
  );
}

function DayLinks({ dates }: { dates: string[] }) {
  if (dates.length === 0) return null;
  return (
    <p className="text-sm text-muted">
      Based on:{" "}
      {dates.map((d, i) => (
        <span key={d}>
          {i > 0 && ", "}
          <Link href={`/patient/history?day=${d}`} className="text-accent underline underline-offset-2">
            {formatDate(d)}
          </Link>
        </span>
      ))}
    </p>
  );
}

export function Suggestions() {
  const [set, setSet] = useState<SuggestionSet | null | "failed">(null);
  useEffect(() => {
    let cancelled = false;
    loadSuggestions()
      .then((s) => !cancelled && setSet(s ?? "failed"))
      .catch(() => !cancelled && setSet("failed"));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-labelledby="things-title" className="flex flex-col gap-3">
      <h2 id="things-title" className="text-xl font-semibold">
        Things you can do
      </h2>
      {set === null && (
        <Card>
          <p className="text-muted" role="status">
            Looking through your own record for things that might help…
          </p>
        </Card>
      )}
      {set === "failed" && (
        <Card>
          <p className="text-muted">The suggestions could not be loaded just now. Try again in a moment.</p>
        </Card>
      )}
      {set && set !== "failed" && set.contactClinic && (
        <Card className="border-alert bg-alert-soft">
          <p className="font-medium text-alert">Please contact the clinic</p>
          <p className="mt-1">{set.contactClinic}</p>
          <Link href="/patient/clinic/new" className="mt-3 inline-block font-medium text-accent underline underline-offset-2">
            Ask for a check-up
          </Link>
        </Card>
      )}
      {set && set !== "failed" && !set.contactClinic && set.suggestions.length === 0 && (
        <Card>
          <p className="text-muted">Nothing in your record calls for a suggestion right now. Keep checking in and they will appear when there is something to point at.</p>
        </Card>
      )}
      {set && set !== "failed" && !set.contactClinic &&
        set.suggestions.map((s) => (
          <Card key={s.id}>
            <h3 className="text-lg font-semibold leading-snug">{s.title}</h3>
            <p className="mt-1">{s.advice}</p>
            <p className="mt-3 text-sm">
              <span className="font-medium">Why: </span>
              {s.reason}
            </p>
            <div className="mt-1">
              <DayLinks dates={s.dates} />
            </div>
          </Card>
        ))}
      {set && set !== "failed" && (
        <p className="text-sm text-muted">
          {set.madeBy === "claude" ? "Written by Claude from your record." : "Written by the built-in stand-in, which reads your own words for patterns. It is not the AI."}{" "}
          Everyday self-care only; anything else is for the clinic.
        </p>
      )}
    </section>
  );
}

export function Sparkline({ points }: { points: (number | null)[] }) {
  const values = points.filter((p): p is number => p !== null);
  if (values.length < 2) return null;
  const w = 320;
  const h = 56;
  const step = w / (points.length - 1);
  let d = "";
  points.forEach((p, i) => {
    if (p === null) return;
    const y = h - 6 - ((p - 1) / 4) * (h - 12);
    d += `${d ? "L" : "M"}${(i * step).toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full" role="img" aria-label="How well it has been working over the last eight weeks, better is higher">
      <path d={`M0,${h - 6 - 0.5 * (h - 12)}H${w}`} stroke="var(--color-line)" strokeDasharray="3 4" fill="none" />
      <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

