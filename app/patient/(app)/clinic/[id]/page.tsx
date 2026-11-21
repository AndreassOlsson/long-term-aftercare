import Link from "next/link";
import { notFound } from "next/navigation";
import { MarkSeen } from "@/components/patient/mark-seen";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { PATIENTS } from "@/lib/patients";
import { getRequest } from "@/lib/requests";

export const dynamic = "force-dynamic";

const KIND = { offer_time: "The clinic suggests a time", question: "The clinic has a question for you", advice: "The clinic's advice" } as const;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { id } = await params;
  const { sent } = await searchParams;
  const request = await getRequest(PATIENTS[0].id, id);
  if (!request) notFound();
  const reached = { sent: 1, seen: 2, answered: 3, handled: 3 }[request.status];
  const steps = ["Sent", "Opened by the clinic", "Answered"];
  const reply = request.reply;

  return (
    <>
      {reply && <MarkSeen id={request.id} updatedAt={request.updatedAt} />}
      <Link href="/patient/clinic" className="min-h-11 content-center text-accent underline underline-offset-2">
        ← The clinic
      </Link>
      {sent && (
        <p role="status" className="rounded-xl border border-accent bg-accent-soft p-3 font-medium">
          Sent. The clinic has your request. You will see the answer here.
        </p>
      )}
      <h1 className="text-2xl font-semibold leading-snug">{request.headline}</h1>

      <Card title="Where it stands">
        <ol className="flex flex-col gap-3">
          {steps.map((label, i) => (
            <li key={label} className={`flex items-center gap-3 ${i + 1 > reached ? "text-muted" : "font-medium"}`}>
              <span aria-hidden="true" className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${i + 1 <= reached ? "bg-accent text-accent-ink" : "border border-line"}`}>
                {i + 1 <= reached ? "✓" : ""}
              </span>
              {label}
              {i === 0 && <span className="text-sm font-normal text-muted">{formatDate(request.createdAt.slice(0, 10))}</span>}
            </li>
          ))}
        </ol>
      </Card>

      {reply && (
        <Card className="border-accent">
          <h2 className="font-semibold text-accent">{KIND[reply.kind]}</h2>
          {reply.proposedTime && (
            <p className="mt-1 text-lg font-semibold">
              {new Date(reply.proposedTime).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" })}
            </p>
          )}
          <p className="mt-1 whitespace-pre-wrap">{reply.text}</p>
          <p className="mt-2 text-sm text-muted">Answered {formatDate(reply.at.slice(0, 10))}</p>
        </Card>
      )}

      <Card title="What you sent">
        <p className="whitespace-pre-wrap">{request.body}</p>
        {request.evidenceDates.length > 0 && (
          <p className="mt-3 text-sm text-muted">
            Days it rests on:{" "}
            {request.evidenceDates.map((d, i) => (
              <span key={d}>
                {i > 0 && ", "}
                <Link href={`/patient/history?day=${d}`} className="text-accent underline underline-offset-2">
                  {formatDate(d)}
                </Link>
              </span>
            ))}
          </p>
        )}
        {request.images.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {request.images.map((key) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={key} src={`/api/images?key=${encodeURIComponent(key)}`} alt="A picture you sent" className="h-24 rounded-xl" />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
