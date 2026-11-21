"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { analyzeCheckin, closeCheckinExchange, commitCheckin, reflectOnCheckin, todaysQuestions, type Analysis } from "@/lib/assessment";
import type { Closing } from "@/lib/agents/reflect-agent";
import { METRICS, combine, ownKeys, scoredEverything, type Scores } from "@/lib/metrics";
import type { Entry, QuestionSet } from "@/lib/types";
import { MeasureRow } from "./measure";
import { ScorePicker } from "./score-picker";

const MAX_IMAGES = 3;
const MAX_SIDE = 1280;

/** Shrinks a photo in the browser so three of them fit in one upload. */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    return blob ? new File([blob], "picture.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

// Dictation uses the browser's own speech recognition where it exists
// (Chrome, Safari). The words land in the text box like typed text.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** A picture in the form: one already saved in today's entry (key) or a new one (file). */
type Picture = { url: string; key: string; file?: never } | { url: string; file: File; key?: never };

/** Makes a textarea as tall as its text (never below its rows), so nothing scrolls inside it. */
function useGrow(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [value]);
  return ref;
}

const pictureOf = (key: string): Picture => ({ key, url: `/api/images?key=${encodeURIComponent(key)}` });

type Phase =
  | { name: "write" }
  | { name: "working"; step: 1 | 2 }
  // Her entry is read and nothing is saved yet: the app asks its one question on a bad day...
  | { name: "asking"; analysis: Analysis; concern: boolean; question: string; madeBy: "claude" | "dummy" }
  // ...and closes with what it will enter, the recommendation when it has one, and the choices.
  | { name: "closing"; analysis: Analysis; concern: boolean; question: string | null; answer: string; closing: Closing | null; recommend: boolean };

const big = "flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-lg font-semibold disabled:opacity-50";

/**
 * The one form for today's check-in. Opened fresh it makes the entry; opened
 * again (with `existing`, today's saved entry) it shows what was saved and
 * saving replaces it. Her own scores are picked on the same labelled scale
 * the record is read in. Nothing is saved until the last screen: on a bad day
 * after bad days the app asks one question there first, and the last screen
 * offers to add to the record, or to add and ask the clinic for a check-up.
 * Removing today's check-in lives on the home page.
 */
export function Checkin({ existing }: { existing: Entry | null }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "write" });
  const saved = existing;
  const [questions, setQuestions] = useState<QuestionSet | null | "none">(null);
  const [text, setText] = useState(existing?.text ?? "");
  const [images, setImages] = useState<Picture[]>(() => existing?.images.map(pictureOf) ?? []);
  const [own, setOwn] = useState<Partial<Scores>>(existing?.ownScores ?? {});
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textBox = useGrow(text);
  const [listening, setListening] = useState(false);
  const [canTalk, setCanTalk] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    todaysQuestions()
      .then((set) => !cancelled && setQuestions(set ?? "none"))
      .catch(() => !cancelled && setQuestions("none"));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Only known in the browser, so it cannot be part of the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanTalk(recognitionCtor() !== null);
    return () => recognition.current?.stop();
  }, []);

  function toggleTalk() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (event) => {
      let heard = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) heard += event.results[i][0].transcript;
      }
      if (heard.trim()) setText((previous) => (previous ? `${previous.trimEnd()} ` : "") + heard.trim());
    };
    r.onend = () => setListening(false);
    recognition.current = r;
    r.start();
    setListening(true);
  }

  async function addPictures(files: FileList | null) {
    if (!files) return;
    const shrunk = await Promise.all([...files].slice(0, MAX_IMAGES - images.length).map(shrink));
    setImages((current) => [...current, ...shrunk.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    if (fileInput.current) fileInput.current.value = "";
  }

  function form(extra?: Record<string, string>) {
    const f = new FormData();
    f.set("text", text);
    for (const image of images) {
      if (image.file) f.append("images", image.file);
      else f.append("keepImages", image.key);
    }
    for (const m of METRICS) {
      const value = own[m.key];
      if (value != null) f.set(`score_${m.key}`, String(value));
    }
    for (const [k, v] of Object.entries(extra ?? {})) f.set(k, v);
    return f;
  }

  /** What the exchange screens send to the server: today's words and the scores as read. */
  const reflection = (analysis: Analysis, extra?: { question: string | null; answer: string }) => ({
    text,
    scores: analysis.scores,
    imageCount: images.length,
    ...extra,
  });

  async function save() {
    recognition.current?.stop();
    setError(null);
    setAnswer("");
    setPhase({ name: "working", step: 1 });
    try {
      const read = await analyzeCheckin(form());
      if (read.status !== "analyzed") {
        setError(read.message);
        setPhase({ name: "write" });
        return;
      }
      // Her own picks stand over whatever was read.
      const scores = { ...read.analysis.scores };
      for (const key of ownKeys(own)) scores[key] = own[key] ?? null;
      const analysis = { ...read.analysis, scores };
      // A correction of what she saved earlier is not a new day: no question again.
      const asked = saved ? null : await reflectOnCheckin(reflection(analysis));
      if (asked && asked.status === "ok" && asked.exchange.question) {
        setPhase({ name: "asking", analysis, concern: read.concern, question: asked.exchange.question, madeBy: asked.exchange.madeBy });
        return;
      }
      await close(analysis, read.concern, null, "");
    } catch {
      setError("The request did not come back. Your words are still here; try again.");
      setPhase({ name: "write" });
    }
  }

  async function close(analysis: Analysis, concern: boolean, question: string | null, said: string) {
    setPhase({ name: "working", step: 2 });
    const result = await closeCheckinExchange(reflection(analysis, { question, answer: said }));
    setPhase({
      name: "closing",
      analysis,
      concern,
      question,
      answer: said,
      closing: result.status === "ok" ? result.closing : null,
      recommend: result.status === "ok" ? result.closing.recommendation !== null : concern,
    });
  }

  /** Enters today in the record; `next` is where she goes from there. */
  async function enter(phaseNow: Extract<Phase, { name: "closing" }>, next: string) {
    setError(null);
    setSaving(true);
    try {
      const result = await commitCheckin(form({ analysis: JSON.stringify(phaseNow.analysis), followUpQuestion: phaseNow.question ?? "", followUpAnswer: phaseNow.answer }));
      if (result.status !== "saved") {
        setError(result.message);
        setSaving(false);
        return;
      }
      router.push(next);
    } catch {
      setError("The request did not come back. Nothing was saved; try again.");
      setSaving(false);
    }
  }

  if (phase.name === "working") {
    const steps = [
      !text.trim() && images.length === 0
        ? "Putting your scores together"
        : images.length
          ? "Reading your words and looking at your picture"
          : "Reading your words",
      "Saving it to your record",
    ];
    return (
      <>
        <h1 className="text-2xl font-semibold">Working on it</h1>
        <Card>
          <ol className="flex flex-col gap-4" role="status" aria-live="polite">
            {steps.map((label, i) => {
              const state = phase.step > i + 1 ? "done" : phase.step === i + 1 ? "now" : "later";
              return (
                <li key={label} className={`flex items-center gap-3 ${state === "later" ? "text-muted" : ""}`}>
                  <span
                    aria-hidden="true"
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${state === "done" ? "bg-accent text-accent-ink" : state === "now" ? "animate-pulse border-2 border-accent" : "border border-line"}`}
                  >
                    {state === "done" ? "✓" : ""}
                  </span>
                  <span className={state === "now" ? "font-medium" : ""}>
                    {label}
                    {state === "now" ? "…" : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
        <p className="text-sm text-muted">
          It also looks at your earlier weeks, so that things like “worse than yesterday” mean what they should. This can take up to half a minute.
        </p>
      </>
    );
  }

  if (phase.name === "asking") {
    const ask = phase;
    return (
      <>
        <h1 className="text-2xl font-semibold">One question</h1>
        <p className="rounded-2xl border border-accent-soft bg-accent-soft p-4 text-lg font-medium" data-testid="reflect-question">
          {ask.question}
        </p>
        <p className="-mt-2 text-sm text-muted">{ask.madeBy === "claude" ? "Asked by Claude, from your record." : "Asked by the built-in stand-in, from your record, not the AI."} Nothing is saved yet.</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick answers">
          <button type="button" onClick={() => setAnswer("I have not done anything different.")} className="min-h-11 rounded-full border border-line bg-surface px-4">
            Nothing different
          </button>
          <button type="button" onClick={() => setAnswer("Yes, something was different: ")} className="min-h-11 rounded-full border border-line bg-surface px-4">
            Something was different
          </button>
        </div>
        <textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          rows={4}
          aria-label="Your answer"
          className="w-full rounded-2xl border border-line bg-surface p-3 text-base"
        />
        <StickyBar>
          <button type="button" disabled={!answer.trim()} onClick={() => close(ask.analysis, ask.concern, ask.question, answer.trim())} className={`${big} bg-accent text-accent-ink`}>
            Answer
          </button>
          <button type="button" onClick={() => close(ask.analysis, ask.concern, ask.question, "")} className="min-h-11 text-accent underline underline-offset-2">
            Skip the question
          </button>
        </StickyBar>
      </>
    );
  }

  if (phase.name === "closing") {
    const done = phase;
    return (
      <>
        <h1 className="text-2xl font-semibold">{saved ? "Save your changes" : "Here is what I will enter"}</h1>
        {done.closing && <p data-testid="closing-message">{done.closing.message}</p>}
        {done.recommend && (
          <section aria-label="A recommendation" className={`rounded-2xl border p-4 ${done.concern ? "border-alert bg-alert-soft" : "border-warn bg-warn-soft"}`} data-testid="recommendation">
            <p className={`font-semibold ${done.concern ? "text-alert" : ""}`}>{done.concern ? "Please contact the clinic" : "A report to the clinic"}</p>
            <p className="mt-1">{done.closing?.recommendation ?? "Please contact the clinic about what you wrote. I can prepare a request from your record."}</p>
            {done.closing && <p className="mt-1 text-xs text-muted">{done.closing.madeBy === "claude" ? "Written by Claude." : "Written by the built-in stand-in, not the AI."}</p>}
          </section>
        )}
        <Card>
          <div className="divide-y divide-line">
            {METRICS.map((m) => (
              <div key={m.key} className="py-1">
                {done.analysis.scores[m.key] === null ? (
                  <div className="py-2">
                    <div className="text-sm text-muted">{m.label}</div>
                    <div className="text-muted">Not recorded: you did not say.</div>
                  </div>
                ) : (
                  <>
                    <MeasureRow name={m.key} score={done.analysis.scores[m.key]} />
                    {ownKeys(own).includes(m.key) && <p className="-mt-1 pb-1 text-sm text-muted">You picked this one.</p>}
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-line pt-2">
            <MeasureRow name="combined" score={combine(done.analysis.scores)} />
          </div>
        </Card>
        <p className="text-sm text-muted">
          {scoredEverything(own)
            ? "Scored by you."
            : done.analysis.analyzedBy === "claude"
              ? `The rest was read by Claude. ${done.analysis.rationale}`
              : done.analysis.analyzedBy === "dummy"
                ? "The rest was read by the built-in stand-in, which only counts words; it is not the AI."
                : "Scored by you."}
        </p>
        {error && (
          <p role="alert" data-testid="checkin-error" className="rounded-xl border border-warn bg-warn-soft p-3 text-warn">
            {error}
          </p>
        )}
        <StickyBar>
          {done.recommend ? (
            <>
              <button type="button" disabled={saving} onClick={() => enter(done, "/patient/clinic/new?from=suggested")} className={`${big} bg-accent text-accent-ink`}>
                {saving ? "Saving…" : "Add to my record and request a visit"}
              </button>
              <button type="button" disabled={saving} onClick={() => enter(done, "/patient")} className={`${big} border border-line bg-surface`}>
                Add to my record
              </button>
            </>
          ) : (
            <button type="button" disabled={saving} onClick={() => enter(done, "/patient")} className={`${big} bg-accent text-accent-ink`}>
              {saving ? "Saving…" : saved ? "Save my changes" : "Add to my record"}
            </button>
          )}
          <button type="button" disabled={saving} onClick={() => setPhase({ name: "write" })} className="min-h-11 text-accent underline underline-offset-2">
            Change what I wrote
          </button>
        </StickyBar>
      </>
    );
  }

  const canSave = text.trim().length > 0 || images.length > 0 || ownKeys(own).length > 0;

  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{saved ? "Today’s check-in" : "Check in"}</h1>
        <Link href="/patient" className="min-h-11 content-center text-accent underline underline-offset-2">
          Cancel
        </Link>
      </header>

      {saved && (
        <p className="rounded-2xl border border-accent-soft bg-accent-soft p-4">
          This is what you saved earlier today. Change the words or the scores, take a picture out or add another, and save to replace it.
        </p>
      )}

      <section aria-labelledby="say-title" className="flex flex-col gap-3">
        <h2 id="say-title" className="text-lg font-semibold">
          How has it been?
        </h2>
        {questions && questions !== "none" ? (
          <ul className="flex flex-col gap-2" data-testid="todays-questions">
            {questions.questions.slice(0, 1).map((q) => (
              <li key={q} className="rounded-2xl border border-accent-soft bg-accent-soft p-3 text-base">
                {q}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{questions === null ? "Reading your record to find what is worth asking…" : "Take your time: itching, comfort, getting about."}</p>
        )}
        <textarea
          ref={textBox}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={5}
          aria-label="Your notes for today"
          placeholder="Write, talk, or add a picture. As much or as little as you like."
          className="w-full resize-none overflow-hidden rounded-2xl border border-line bg-surface p-3 text-base"
        />
        {questions && questions !== "none" && (
          <details className="text-sm text-muted">
            <summary className="min-h-8 cursor-pointer">Why this question?</summary>
            <p className="mt-1">{questions.basedOn}</p>
            <p className="mt-1">{questions.askedBy === "claude" ? "Asked by Claude." : "Asked by the built-in stand-in, not the AI."}</p>
          </details>
        )}
        {images.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {images.map((image, i) => (
              <li key={image.url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={`Your picture ${i + 1}`} className="h-20 w-20 rounded-xl object-cover" />
                <button
                  type="button"
                  onClick={() => setImages((current) => current.filter((_, j) => j !== i))}
                  aria-label={`Remove picture ${i + 1}`}
                  className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-3">
          {canTalk && (
            <Button type="button" onClick={toggleTalk} className="flex-1">
              {listening ? "Stop talking" : "Talk"}
            </Button>
          )}
          <input ref={fileInput} type="file" accept="image/*" multiple hidden data-testid="picture-input" onChange={(event) => addPictures(event.target.files)} />
          <Button type="button" onClick={() => fileInput.current?.click()} disabled={images.length >= MAX_IMAGES} className="flex-1">
            Add a picture
          </Button>
        </div>
      </section>

      <details open={ownKeys(own).length > 0} aria-labelledby="own-title" className="rounded-2xl border border-line bg-surface p-4" data-testid="own-scores">
        <summary id="own-title" className="min-h-8 cursor-pointer text-lg font-semibold">
          Or score it yourself
        </summary>
        <p className="mt-2 text-sm text-muted">
          If you like, say how each one has been. What you pick is what is recorded, and it is marked as yours. Whatever you leave open is read from your words and pictures.
        </p>
        <div className="mt-2 divide-y divide-line">
          {METRICS.map((m) => (
            <ScorePicker key={m.key} metric={m} value={own[m.key] ?? null} onChange={(value) => setOwn((current) => ({ ...current, [m.key]: value }))} />
          ))}
        </div>
      </details>

      {error && (
        <p role="alert" data-testid="checkin-error" className="rounded-xl border border-warn bg-warn-soft p-3 text-warn">
          {error}
        </p>
      )}
      <StickyBar>
        <button type="button" onClick={save} disabled={!canSave} className={`${big} bg-accent text-accent-ink`}>
          {saved ? "Continue with my changes" : "Continue"}
        </button>
      </StickyBar>
    </>
  );
}

/** The action of a screen, kept at the foot of the screen so it is never scrolled past. */
function StickyBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col items-stretch gap-2 border-t border-line bg-page/95 px-4 pb-4 pt-3 backdrop-blur">
      {children}
    </div>
  );
}
