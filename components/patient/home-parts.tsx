"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { loadSuggestions } from "@/lib/assessment";
import { formatDate } from "@/lib/dates";
import type { SuggestionSet } from "@/lib/suggestions";

function DayLinks({ dates }: { dates: string[] }) {
  if (dates.length === 0) return null;
  return (
    <p className="text-sm text-muted">
      Based on:{" "}
      {dates.map((d, i) => (
        <span key={d}>
          {i > 0 && ", "}
          <Link href={`/patient?day=${d}#history`} className="text-accent underline underline-offset-2">
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
      <h2 id="things-title" className="sr-only">
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
