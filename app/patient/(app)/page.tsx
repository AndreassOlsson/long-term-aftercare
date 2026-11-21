import Link from "next/link";
import { Card } from "@/components/ui/card";
import { History } from "@/components/patient/history";
import { HomeActions } from "@/components/patient/home-actions";
import { HomeGraph } from "@/components/patient/home-graph";
import { Suggestions } from "@/components/patient/home-parts";
import { Pager, type PagerSection } from "@/components/patient/pager";
import { TextSize } from "@/components/patient/text-size";
import { hasKey, MODEL } from "@/lib/agents/run";
import { logout } from "@/lib/actions";
import { addDays, formatDate, today } from "@/lib/dates";
import { getEntries } from "@/lib/entries";
import { lately, sustainedChange, wordFor } from "@/lib/metrics";
import { storageNotice } from "@/lib/notice";
import { PATIENTS } from "@/lib/patients";
import { listRequests, type RequestStatus } from "@/lib/requests";

// Reads the record on every visit: the pages are only ever as old as the last check-in.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STAGES: Record<RequestStatus, string> = {
  sent: "Sent",
  seen: "Opened by the clinic",
  answered: "Answered",
  handled: "Handled",
};

// One full page per section, in the order she needs them: how it is, how it has
// been, what she can do, the clinic, her settings. Icons are 24 px stroke paths.
const ICONS = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  history: "M3 20h18M5 16l4-5 4 3 6-8",
  ideas: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z",
  clinic: "M4 5h16v11H9l-5 4z",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { day } = await searchParams;
  const patient = PATIENTS[0];
  const now = today();
  const [entries, requests] = await Promise.all([getEntries(patient.id), listRequests(patient.id)]);
  const state = lately(entries, now);
  const change = sustainedChange(entries, now);
  const todays = entries.find((e) => e.date === now && e.analyzedBy !== "seed") ?? null;
  const open = requests.filter((r) => r.status !== "handled");
  const answered = requests.filter((r) => r.status === "answered" && r.reply).map((r) => ({ id: r.id, updatedAt: r.updatedAt }));
  // A change in the record is worth a request unless one has already been sent since it began.
  const proposed = change && !requests.some((r) => r.createdAt.slice(0, 10) >= change.since) ? change : null;
  const concern = entries.filter((e) => e.date >= addDays(now, -7)).some((e) => e.safetyFlag);
  const concernAsked = requests.some((r) => r.createdAt.slice(0, 10) >= addDays(now, -7));
  const notice = storageNotice();
  const initialDay = day && entries.some((e) => e.date === day) ? day : null;
  const ai = hasKey();

  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Stockholm" }).format(new Date()));
  const greeting = hour < 11 ? "Good morning" : hour < 17 ? "Hello" : "Good evening";

  const home = (
    <>
      <header>
        <h1 className="text-2xl font-semibold">
          {greeting}, {patient.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-muted">{state.sentences[0]}</p>
      </header>
      {notice && <p className="rounded-xl border border-warn bg-warn-soft p-3 text-sm text-warn">{notice}</p>}
      {concern && (
        <div className="rounded-2xl border border-alert bg-alert-soft p-3">
          <p className="font-semibold text-alert">Please contact the clinic</p>
          <p className="mt-1 text-sm">You wrote about something that could be a wound or a sign of infection. That is for the clinic to look at, not something to treat at home.</p>
          {!concernAsked && (
            <Link href="/patient/clinic/new" className="mt-2 flex min-h-11 items-center justify-center rounded-xl bg-alert px-4 font-semibold text-accent-ink">
              Ask for a check-up now
            </Link>
          )}
        </div>
      )}
      <div className="-mx-4 flex min-h-0 flex-1 flex-col">
        <HomeGraph
          points={entries.filter((e) => e.combined !== null).map((e) => ({ date: e.date, combined: e.combined as number }))}
          today={now}
          checkedIn={todays !== null}
        />
      </div>
      <HomeActions checkedIn={todays !== null} mood={todays ? wordFor("combined", todays.combined).toLowerCase() : null} />
    </>
  );

  const history = (
    <>
      <h1 className="text-2xl font-semibold">Your history</h1>
      <p className="-mt-3 text-muted">How well your prosthesis has been working. Higher on the graph is better.</p>
      <History entries={entries} initialDay={initialDay} />
    </>
  );

  const ideas = (
    <>
      <h1 className="text-2xl font-semibold">Things you can do</h1>
      <p className="-mt-3 text-muted">From your own record, each with the reason.</p>
      <Suggestions />
    </>
  );

  const clinic = (
    <>
      <h1 className="text-2xl font-semibold">The clinic</h1>
      <Link href="/patient/clinic/new" className="flex min-h-14 items-center justify-center rounded-2xl bg-accent px-5 text-lg font-semibold text-accent-ink">
        Ask for a check-up
      </Link>
      <p className="-mt-2 text-center text-sm text-muted">I prepare it from your record. You read it and change it before it goes.</p>
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
      <section className="flex flex-col gap-3" aria-labelledby="req-title">
        <h2 id="req-title" className="text-xl font-semibold">
          Your requests
        </h2>
        {requests.length === 0 && (
          <Card>
            <p className="text-muted">You have not asked for a check-up yet. When you do, you will see here where it stands and what the clinic answers.</p>
          </Card>
        )}
        {requests.map((r) => (
          <Link key={r.id} href={`/patient/clinic/${r.id}`} className="block rounded-2xl border border-line bg-surface p-4" data-request={r.id}>
            <div className="font-semibold">{r.headline}</div>
            <div className="mt-1 text-sm text-muted">Sent {formatDate(r.createdAt.slice(0, 10))}</div>
            <div className={`mt-2 inline-block rounded-full px-3 py-0.5 text-sm font-medium ${r.status === "answered" ? "bg-accent-soft text-accent" : "bg-page text-muted"}`}>{STAGES[r.status]}</div>
          </Link>
        ))}
        {open.length === 0 && requests.length > 0 && <p className="text-sm text-muted">Nothing is waiting with the clinic.</p>}
      </section>
    </>
  );

  const settings = (
    <>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Card title="You">
        <p className="text-lg font-medium">{patient.name}</p>
      </Card>
      <TextSize />
      <Card title="Who reads your words">
        <p>
          {ai
            ? `The questions, the reading of your check-ins, the suggestions and the drafted requests are written by Claude (${MODEL}).`
            : "No AI key is set on this deployment, so a built-in stand-in does the reading, the questions, the suggestions and the drafts. It is simpler and only looks for words. Every screen says which one answered."}
        </p>
      </Card>
      <form action={logout.bind(null, "patient")}>
        <button className="min-h-12 w-full rounded-xl border border-line bg-surface px-4 font-medium">Log out</button>
      </form>
    </>
  );

  const sections: PagerSection[] = [
    { id: "home", label: "Home", icon: ICONS.home, content: home },
    { id: "history", label: "History", icon: ICONS.history, content: history },
    { id: "ideas", label: "Ideas", icon: ICONS.ideas, content: ideas },
    { id: "clinic", label: "Clinic", icon: ICONS.clinic, content: clinic },
    { id: "settings", label: "Settings", icon: ICONS.settings, content: settings },
  ];
  return <Pager sections={sections} answered={answered} />;
}
