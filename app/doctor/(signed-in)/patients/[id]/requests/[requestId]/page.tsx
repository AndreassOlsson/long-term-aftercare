import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AnswerPanel, MarkSeen } from "@/components/clinician/answer";
import { MeasureChart } from "@/components/clinician/chart";
import { allChanges, describeChange, SERIES } from "@/components/clinician/case";
import { DayLink, DayProvider } from "@/components/clinician/day";
import { dateTime, fmtScore, longDate, toLocalInput } from "@/components/clinician/format";
import { Pictures } from "@/components/clinician/pictures";
import { requireRole } from "@/lib/auth";
import { getEntries } from "@/lib/entries";
import { getPatient } from "@/lib/patients";
import { getRequest } from "@/lib/requests";

export const dynamic = "force-dynamic";

const STATUS = { sent: "New", seen: "Seen", answered: "Answered", handled: "Handled" } as const;

/** A sensible first offer: ten o'clock, two days from now, skipping the weekend. */
function suggestedTime(): string {
  const base = new Date(Date.now() + 2 * 86400000);
  let day = toLocalInput(base.toISOString()).slice(0, 10);
  for (let i = 0; i < 3; i++) {
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) break;
    const next = new Date(`${day}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    day = next.toISOString().slice(0, 10);
  }
  return `${day}T10:00`;
}

export default async function Page({ params }: { params: Promise<{ id: string; requestId: string }> }) {
  await requireRole("doctor");
  const { id, requestId } = await params;
  const patient = getPatient(id);
  if (!patient || patient.placeholder) notFound();
  const request = await getRequest(patient.id, requestId);
  if (!request) notFound();
  const entries = await getEntries(patient.id);

  // The case is worked out as of the day the request was sent.
  const sentOn = new Date(request.createdAt).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  const upTo = entries.filter((e) => e.date <= sentOn).slice(-1)[0]?.date;
  const changes = allChanges(entries, upTo);
  const combined = changes[0];
  const dates = [...request.evidenceDates].sort();
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const words = dates.map((d) => byDate.get(d)).filter((e) => e && e.text.trim());
  const picturesAttached = request.images;

  return (
    <DayProvider entries={entries}>
      <MarkSeen patientId={patient.id} id={request.id} status={request.status} />
      <div className="space-y-6">
        <Link href="/doctor" className="text-sm text-accent hover:underline">
          ← Inbox
        </Link>
        <header className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{request.headline}</h1>
            <Badge tone={request.status === "sent" ? "accent" : "neutral"}>{STATUS[request.status]}</Badge>
          </div>
          <p className="text-sm text-muted">
            <Link href={`/doctor/patients/${patient.id}`} className="text-accent hover:underline">
              {patient.name}
            </Link>{" "}
            · sent {dateTime(request.createdAt)} ·{" "}
            {request.raisedBy === "suggested" ? "sent after the app suggested asking for a check-up" : "asked for by the patient"}
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-6">
            <Card title="What has changed">
              <ul className="space-y-1">
                {changes
                  .filter((c) => c.key !== "combined" && c.since)
                  .map((c) => (
                    <li key={c.key}>{describeChange(c)}</li>
                  ))}
                {changes.every((c) => c.key === "combined" || !c.since) && <li>{describeChange(combined)}</li>}
              </ul>
              {combined.since && (
                <p className="mt-3 text-sm">
                  The combined figure has been lower than usual since <DayLink date={combined.since} />.
                </p>
              )}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="mb-1 text-left text-xs text-muted">
                    Figures from the record, 1 to 5 with 5 the good end. &ldquo;Now&rdquo; is the mean of the latest three days.
                  </caption>
                  <thead>
                    <tr className="border-b border-line text-left text-muted">
                      <th className="py-1 pr-3 font-medium">Measure</th>
                      <th className="py-1 pr-3 font-medium">Usual</th>
                      <th className="py-1 pr-3 font-medium">Now</th>
                      <th className="py-1 pr-3 font-medium">Change</th>
                      <th className="py-1 font-medium">Lowest recently</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((c) => (
                      <tr key={c.key} className="border-b border-line last:border-0">
                        <th scope="row" className={`py-1.5 pr-3 text-left ${c.key === "combined" ? "font-semibold" : "font-normal"}`}>
                          {c.label}
                        </th>
                        <td className="py-1.5 pr-3 tabular-nums">{fmtScore(c.baseline)}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{fmtScore(c.now)}</td>
                        <td className={`py-1.5 pr-3 tabular-nums ${c.delta !== null && c.delta <= -0.5 ? "text-alert" : ""}`}>
                          {c.delta === null ? "-" : `${c.delta > 0 ? "+" : ""}${c.delta.toFixed(1)}`}
                        </td>
                        <td className="py-1.5">
                          {c.lowest ? (
                            <>
                              {fmtScore(c.lowest.value)} <DayLink date={c.lowest.date} className="text-xs" />
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="The figures over time">
              <div className="grid gap-5 md:grid-cols-2">
                {SERIES.map((s) => (
                  <MeasureChart key={s.key} entries={entries} seriesKey={s.key} range="3m" height={140} />
                ))}
              </div>
            </Card>

            <Card title="In her words">
              <blockquote className="border-l-2 border-accent pl-3 whitespace-pre-wrap" data-testid="request-body">
                {request.body}
              </blockquote>
              <p className="mt-2 text-xs text-muted">Written or accepted by the patient when she sent the request.</p>
              {dates.length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-1 text-sm font-medium text-muted">The days it rests on</h3>
                  <p className="mb-2 flex flex-wrap gap-1">
                    {dates.map((d) => (
                      <DayLink key={d} date={d} className="border border-line" />
                    ))}
                  </p>
                  <ul className="space-y-2 text-sm">
                    {words.map((e) => (
                      <li key={e!.date}>
                        <DayLink date={e!.date} className="font-medium">
                          {longDate(e!.date)}
                        </DayLink>
                        : {e!.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            <Card title="Pictures over time">
              <Pictures entries={entries} attached={picturesAttached} />
            </Card>
          </div>

          <div className="lg:sticky lg:top-6 lg:self-start">
            <AnswerPanel patientId={patient.id} request={request} defaultTime={suggestedTime()} />
          </div>
        </div>
      </div>
    </DayProvider>
  );
}
