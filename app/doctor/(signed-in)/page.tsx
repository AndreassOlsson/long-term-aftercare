import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AutoRefresh } from "@/components/clinician/auto-refresh";
import { ago, dateTime } from "@/components/clinician/format";
import { reasonLine } from "@/components/clinician/case";
import { requireRole } from "@/lib/auth";
import { getEntries } from "@/lib/entries";
import { PATIENTS } from "@/lib/patients";
import { listRequests, type CheckupRequest } from "@/lib/requests";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireRole("doctor");
  const real = PATIENTS.filter((p) => !p.placeholder);
  const [requestLists, entryLists] = await Promise.all([
    Promise.all(real.map((p) => listRequests(p.id))),
    Promise.all(real.map((p) => getEntries(p.id))),
  ]);
  const all = requestLists.flat();
  // Not yet seen first, then the longest-waiting.
  const waiting = all
    .filter((r) => r.status === "sent" || r.status === "seen")
    .sort((a, b) => (a.status === b.status ? a.createdAt.localeCompare(b.createdAt) : a.status === "sent" ? -1 : 1));
  const answered = all.filter((r) => r.status === "answered");
  const handledCount = all.filter((r) => r.status === "handled").length;
  const nameOf = (id: string) => PATIENTS.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="space-y-10">
      <AutoRefresh />
      <section aria-labelledby="needs">
        <div className="mb-3 flex items-baseline justify-between">
          <h1 id="needs" className="text-2xl font-semibold">
            Needs an answer
          </h1>
          <p className="text-sm text-muted">{waiting.length === 0 ? "Nothing waiting" : `${waiting.length} waiting`}</p>
        </div>
        {waiting.length === 0 ? (
          <Card>
            <p className="text-muted">No check-up requests are waiting. New ones appear here as patients send them.</p>
          </Card>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface" data-testid="waiting">
            {waiting.map((r) => (
              <RequestRow key={r.id} request={r} name={nameOf(r.patientId)} />
            ))}
          </ul>
        )}
      </section>

      {answered.length > 0 && (
        <section aria-labelledby="answered">
          <h2 id="answered" className="mb-3 text-lg font-semibold">
            Answered, waiting for the patient
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {answered.map((r) => (
              <RequestRow key={r.id} request={r} name={nameOf(r.patientId)} />
            ))}
          </ul>
          {handledCount > 0 && <p className="mt-2 text-sm text-muted">{handledCount} handled earlier.</p>}
        </section>
      )}

      <section aria-labelledby="patients">
        <h2 id="patients" className="mb-3 text-lg font-semibold">
          Patients
        </h2>
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {PATIENTS.map((p) => {
            const index = real.findIndex((x) => x.id === p.id);
            const reason = p.placeholder ? null : reasonLine(entryLists[index]);
            return (
              <li key={p.id}>
                <Link href={`/doctor/patients/${p.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-page">
                  <div className="w-52 shrink-0">
                    <p className="font-medium">{p.name}</p>
                    {p.caseId && <p className="text-xs text-muted">Case {p.caseId}</p>}
                  </div>
                  <p className="flex-1 text-sm text-muted">{reason ? reason.text : p.note}</p>
                  {p.placeholder ? (
                    <Badge>Placeholder</Badge>
                  ) : (
                    reason && reason.tone !== "neutral" && <Badge tone={reason.tone}>Declining</Badge>
                  )}
                  <span aria-hidden className="text-muted">→</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function RequestRow({ request, name }: { request: CheckupRequest; name: string }) {
  const tone = request.status === "sent" ? "accent" : "neutral";
  const label = { sent: "New", seen: "Seen", answered: "Answered", handled: "Handled" }[request.status];
  return (
    <li>
      <Link
        href={`/doctor/patients/${request.patientId}/requests/${request.id}`}
        className="flex items-start gap-4 px-5 py-4 hover:bg-page"
        data-request={request.id}
      >
        <div className="w-52 shrink-0">
          <p className={request.status === "sent" ? "font-semibold" : "font-medium"}>{name}</p>
          <p className="text-xs text-muted" title={dateTime(request.createdAt)}>
            Sent {ago(request.createdAt)}
          </p>
        </div>
        <p className={`flex-1 ${request.status === "sent" ? "font-medium" : ""}`}>{request.headline}</p>
        <Badge tone={tone}>{label}</Badge>
      </Link>
    </li>
  );
}
