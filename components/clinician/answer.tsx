"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { answerRequest, markHandled, markSeen } from "@/app/doctor/(signed-in)/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CheckupRequest, RequestReply } from "@/lib/requests";
import { dateTime } from "./format";

/** Opening a request marks it seen, once, from the browser (a prefetch never runs this). */
export function MarkSeen({ patientId, id, status }: { patientId: string; id: string; status: string }) {
  const router = useRouter();
  useEffect(() => {
    if (status !== "sent") return;
    markSeen(patientId, id).then(() => router.refresh());
  }, [patientId, id, status, router]);
  return null;
}

const KINDS: { key: RequestReply["kind"]; label: string; hint: string }[] = [
  { key: "offer_time", label: "Offer a time", hint: "She sees the time on her phone and can accept it there." },
  { key: "question", label: "Ask a question", hint: "Ask what you need to know before you can assess it." },
  { key: "advice", label: "Give advice", hint: "Self-care or what to do until the visit. The app passes this on as you wrote it." },
];

const KIND_LABEL: Record<RequestReply["kind"], string> = {
  offer_time: "Offered a time",
  question: "Asked a question",
  advice: "Gave advice",
};

export function AnswerPanel({
  patientId,
  request,
  defaultTime,
}: {
  patientId: string;
  request: CheckupRequest;
  defaultTime: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<RequestReply["kind"]>("offer_time");
  const [text, setText] = useState("");
  const [time, setTime] = useState(defaultTime);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const reply = request.reply;
  const hint = KINDS.find((k) => k.key === kind)!.hint;

  function send() {
    setError(null);
    start(async () => {
      try {
        const result = await answerRequest(patientId, request.id, { kind, text, proposedLocal: time });
        if (!result.ok) return setError(result.error);
        setEditing(false);
        setText("");
        router.refresh();
      } catch {
        setError("It could not be sent. Check the connection and try again; nothing was lost.");
      }
    });
  }

  function handled() {
    start(async () => {
      try {
        await markHandled(patientId, request.id);
        router.refresh();
      } catch {
        setError("It could not be saved. Try again.");
      }
    });
  }

  if (request.status === "handled") {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5">
        <Badge>Handled</Badge>
        <p className="mt-2 text-sm text-muted">This request is closed.</p>
        {reply && <ReplyBox reply={reply} />}
      </section>
    );
  }

  return (
    <section aria-labelledby="answer" className="rounded-2xl border border-line bg-surface p-5">
      <h2 id="answer" className="mb-3 text-lg font-semibold">
        {reply && !editing ? "Your answer" : "Answer"}
      </h2>

      {reply && !editing ? (
        <>
          <ReplyBox reply={reply} />
          <p className="mt-2 text-sm text-muted">It is saved on the request, and the patient&apos;s side shows it.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Answer again
            </Button>
            <Button variant="primary" onClick={handled} disabled={pending}>
              Mark handled
            </Button>
          </div>
        </>
      ) : (
        <>
          <div role="tablist" aria-label="Kind of answer" className="mb-3 flex rounded-xl border border-line p-0.5 text-sm">
            {KINDS.map((k) => (
              <button
                key={k.key}
                role="tab"
                aria-selected={kind === k.key}
                onClick={() => setKind(k.key)}
                className={`flex-1 rounded-lg px-2 py-1.5 ${kind === k.key ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="mb-3 text-sm text-muted">{hint}</p>
          {kind === "offer_time" && (
            <label className="mb-3 flex flex-col gap-1 text-sm">
              Date and time (Swedish time)
              <input
                type="datetime-local"
                name="proposedTime"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="rounded-lg border border-line px-3 py-2 text-base"
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            {kind === "offer_time" ? "Note to the patient (optional)" : kind === "question" ? "Your question" : "Your advice"}
            <textarea
              name="reply"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
              }}
              className="rounded-lg border border-line px-3 py-2 text-base"
              placeholder={kind === "offer_time" ? "Bring the liner you are wearing." : ""}
            />
          </label>
          {error && (
            <p role="alert" className="mt-2 text-sm text-alert">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={send} disabled={pending}>
              {pending ? "Sending…" : kind === "offer_time" ? "Send the time" : "Send"}
            </Button>
            {editing ? (
              <Button variant="quiet" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            ) : (
              <Button variant="secondary" onClick={handled} disabled={pending}>
                Mark handled without a reply
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function ReplyBox({ reply }: { reply: RequestReply }) {
  return (
    <div className="rounded-xl bg-accent-soft p-3 text-sm" data-testid="reply">
      <p className="font-medium">
        {KIND_LABEL[reply.kind]}
        {reply.proposedTime ? `: ${dateTime(reply.proposedTime)}` : ""}
      </p>
      {reply.text && <p className="mt-1 whitespace-pre-wrap">{reply.text}</p>}
      <p className="mt-1 text-xs text-muted">Sent {dateTime(reply.at)}</p>
    </div>
  );
}
