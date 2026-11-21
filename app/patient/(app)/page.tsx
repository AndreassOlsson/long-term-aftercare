import Link from "next/link";
import { Card } from "@/components/ui/card";
import { MainAction, Sparkline, Suggestions, type MainChoice } from "@/components/patient/home-parts";
import { addDays, formatDate, today } from "@/lib/dates";
import { getEntries } from "@/lib/entries";
import { lately, sustainedChange } from "@/lib/metrics";
import { storageNotice } from "@/lib/notice";
import { PATIENTS } from "@/lib/patients";
import { listRequests } from "@/lib/requests";

// Reads the record on every visit: the home screen is only ever as old as the last check-in.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STAGES: Record<string, string> = {
  sent: "Sent, not yet opened",
  seen: "The clinic has opened it",
  answered: "The clinic has answered",
  handled: "Handled",
};

export default async function Home() {
  const patient = PATIENTS[0];
  const now = today();
  const [entries, requests] = await Promise.all([getEntries(patient.id), listRequests(patient.id)]);
  const state = lately(entries, now);
  const change = sustainedChange(entries, now);
  const open = requests.filter((r) => r.status !== "handled");
  const answered = requests.filter((r) => r.status === "answered" && r.reply);
  // A change in the record is worth a request unless one has already been sent since it began.
  const proposed = change && !requests.some((r) => r.createdAt.slice(0, 10) >= change.since) ? change : null;
  const concern = entries.filter((e) => e.date >= addDays(now, -7)).some((e) => e.safetyFlag);
  const concernAsked = requests.some((r) => r.createdAt.slice(0, 10) >= addDays(now, -7));
  const notice = storageNotice();

  const fallback: MainChoice =
    state.daysSinceLast === 0
      ? { label: "See how it has been", hint: "You have checked in today.", href: "/patient/history" }
      : { label: "Check in", hint: "About a minute. Say how it has been in your own words.", href: "/patient/checkin" };

  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Stockholm" }).format(new Date()));
  const greeting = hour < 11 ? "Good morning" : hour < 17 ? "Hello" : "Good evening";
  const spark = Array.from({ length: 8 }, (_, w) => {
    const to = addDays(now, -(7 - w) * 7);
    const from = addDays(to, -6);
    const inWeek = entries.filter((e) => e.date >= from && e.date <= to && e.combined !== null);
    return inWeek.length ? inWeek.reduce((a, e) => a + (e.combined as number), 0) / inWeek.length : null;
  });

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">
          {greeting}, {patient.name.split(" ")[0]}
        </h1>
      </header>

      {notice && <p className="rounded-xl border border-warn bg-warn-soft p-3 text-sm text-warn">{notice}</p>}

      <Card>
        <h2 className="text-sm font-medium text-muted">How things have been lately</h2>
        <div className="mt-2 flex flex-col gap-2">
          {state.sentences.map((s) => (
            <p key={s}>{s}</p>
          ))}
        </div>
        <div className="mt-3">
          <Sparkline points={spark} />
          <p className="text-xs text-muted">The last eight weeks, higher is better.</p>
        </div>
      </Card>

      {concern && (
        <Card className="border-alert bg-alert-soft">
          <p className="font-semibold text-alert">Please contact the clinic</p>
          <p className="mt-1">
            You wrote about something that could be a wound or a sign of infection. That is for the clinic to look at, not something to treat at home.
          </p>
          {!concernAsked && (
            <Link href="/patient/clinic/new" className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-alert px-4 font-semibold text-accent-ink">
              Ask for a check-up now
            </Link>
          )}
        </Card>
      )}

      <MainAction
        answered={answered.map((r) => ({ id: r.id, updatedAt: r.updatedAt, headline: r.headline }))}
        fallback={fallback}
      />

      {state.daysSinceLast === 0 && (
        <p className="text-center text-sm">
          <Link href="/patient/checkin" className="text-accent underline underline-offset-2">
            Change or remove today’s check-in
          </Link>
        </p>
      )}

      {proposed && !concern && (
        <Card className="border-warn bg-warn-soft">
          <h2 className="font-semibold">Your record shows a change</h2>
          <p className="mt-1">
            Since about {formatDate(proposed.since)} things have been clearly harder than your usual. This might be worth a check-up. I can prepare the request from your record; you read it, change it and decide whether to send it.
          </p>
          <Link href="/patient/clinic/new?from=suggested" className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-warn bg-surface px-4 font-semibold">
            Prepare a request
          </Link>
        </Card>
      )}

      {open.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="open-title">
          <h2 id="open-title" className="text-xl font-semibold">
            With the clinic
          </h2>
          {open.slice(0, 2).map((r) => (
            <Link key={r.id} href={`/patient/clinic/${r.id}`} className="block rounded-2xl border border-line bg-surface p-4">
              <div className="font-medium">{r.headline}</div>
              <div className="mt-1 text-sm text-muted">
                {STAGES[r.status]}, sent {formatDate(r.createdAt.slice(0, 10))}
              </div>
            </Link>
          ))}
        </section>
      )}

      <Suggestions />

      {!proposed && !concern && open.length === 0 && (
        <p className="text-center text-sm text-muted">
          Want to be seen?{" "}
          <Link href="/patient/clinic/new" className="text-accent underline underline-offset-2">
            Ask for a check-up
          </Link>
        </p>
      )}
    </>
  );
}
