import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { PATIENTS } from "@/lib/patients";
import { listRequests, type RequestStatus } from "@/lib/requests";

export const dynamic = "force-dynamic";

const WORDS: Record<RequestStatus, string> = {
  sent: "Sent",
  seen: "Opened by the clinic",
  answered: "Answered",
  handled: "Handled",
};

export default async function Page() {
  const requests = await listRequests(PATIENTS[0].id);
  return (
    <>
      <h1 className="text-2xl font-semibold">The clinic</h1>
      <Link href="/patient/clinic/new" className="flex min-h-14 items-center justify-center rounded-2xl bg-accent px-5 text-lg font-semibold text-accent-ink">
        Ask for a check-up
      </Link>
      <p className="-mt-2 text-center text-sm text-muted">I prepare it from your record. You read it and change it before it goes.</p>
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
          <Link key={r.id} href={`/patient/clinic/${r.id}`} className="block rounded-2xl border border-line bg-surface p-4">
            <div className="font-semibold">{r.headline}</div>
            <div className="mt-1 text-sm text-muted">Sent {formatDate(r.createdAt.slice(0, 10))}</div>
            <div className={`mt-2 inline-block rounded-full px-3 py-0.5 text-sm font-medium ${r.status === "answered" ? "bg-accent-soft text-accent" : "bg-page text-muted"}`}>
              {WORDS[r.status]}
            </div>
          </Link>
        ))}
      </section>
    </>
  );
}
