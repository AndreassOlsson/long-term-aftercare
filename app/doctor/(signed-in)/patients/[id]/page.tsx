import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DayLink } from "@/components/clinician/day";
import { RecordView } from "@/components/clinician/record-view";
import { ago, longDate } from "@/components/clinician/format";
import { buildCaseSummary } from "@/lib/agents/summary";
import { requireRole } from "@/lib/auth";
import { getEntries } from "@/lib/entries";
import { getPatient } from "@/lib/patients";
import { listRequests } from "@/lib/requests";
import type { Entry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("doctor");
  const patient = getPatient((await params).id);
  if (!patient) notFound();

  if (patient.placeholder) {
    return (
      <div className="space-y-4">
        <Back />
        <h1 className="text-2xl font-semibold">{patient.name}</h1>
        <Card>
          <Badge>Placeholder</Badge>
          <p className="mt-2">
            Case {patient.caseId} stands in for the rest of the clinic&apos;s patients. It has no record in this proof of concept.
            Maria Andersson is the patient with a full history.
          </p>
        </Card>
      </div>
    );
  }

  const [entries, requests] = await Promise.all([getEntries(patient.id), listRequests(patient.id)]);
  const first = entries[0]?.date;
  const last = entries[entries.length - 1]?.date;
  return (
    <div className="space-y-6">
      <Back />
      <header>
        <h1 className="text-2xl font-semibold">{patient.name}</h1>
        <p className="text-sm text-muted">
          Self-reported record, {entries.length} days
          {first && last ? ` from ${longDate(first)} to ${longDate(last)}` : ""}. What the patient reports is recorded and passed on here; it is not a diagnosis.
        </p>
      </header>
      {requests.length > 0 && (
        <Card title="Check-up requests">
          <ul className="divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <Link href={`/doctor/patients/${patient.id}/requests/${r.id}`} className="flex-1 text-accent hover:underline">
                  {r.headline}
                </Link>
                <span className="text-sm text-muted">{ago(r.createdAt)}</span>
                <Badge tone={r.status === "sent" ? "accent" : "neutral"}>{r.status === "sent" ? "New" : r.status[0].toUpperCase() + r.status.slice(1)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <RecordView
        entries={entries}
        requests={requests}
        summary={
          <Suspense fallback={<Card title="Summary"><p className="text-muted">Writing the summary…</p></Card>}>
            <Summary patientId={patient.id} entries={entries} />
          </Suspense>
        }
      />
    </div>
  );
}

function Back() {
  return (
    <Link href="/doctor" className="text-sm text-accent hover:underline">
      ← Inbox
    </Link>
  );
}

async function Summary({ patientId, entries }: { patientId: string; entries: Entry[] }) {
  const summary = await buildCaseSummary(patientId, entries);
  return (
    <Card title="Summary of the record">
      <div className="space-y-2" data-summary-by={summary.by}>
        {summary.sentences.map((s, i) => (
          <p key={i}>
            {s.text}{" "}
            {s.days.slice(0, 4).map((d) => (
              <DayLink key={d} date={d} className="text-xs">
                {new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}
              </DayLink>
            ))}
          </p>
        ))}
      </div>
      <p className="mt-3 border-t border-line pt-2 text-xs text-muted">
        {summary.by === "claude"
          ? "Written by the AI from the entries. Each date opens the day the sentence rests on."
          : `Written by the built-in stand-in from the figures, not by the AI. ${summary.note ?? ""} Each date opens the day the sentence rests on.`}
      </p>
    </Card>
  );
}
