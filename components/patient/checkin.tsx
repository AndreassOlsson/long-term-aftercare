"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  analyzeCheckin,
  commitCheckin,
  correctEntry,
  todaysQuestions,
  type Analysis,
} from "@/lib/assessment";
import { METRICS, combine, type MetricKey, type Scores } from "@/lib/metrics";
import type { QuestionSet } from "@/lib/types";
import { MeasureRow, Steps } from "./measure";

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

type Phase =
  | { name: "write" }
  | { name: "working"; step: 1 | 2 }
  | { name: "recorded"; analysis: Analysis; concern: boolean; date: string };

const big = "flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-lg font-semibold disabled:opacity-50";

export function Checkin() {
  const [phase, setPhase] = useState<Phase>({ name: "write" });
  const [questions, setQuestions] = useState<QuestionSet | null | "none">(null);
  const [text, setText] = useState("");
  const [images, setImages] = useState<{ file: File; url: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
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
    for (const image of images) f.append("images", image.file);
    for (const [k, v] of Object.entries(extra ?? {})) f.set(k, v);
    return f;
  }

  async function save() {
    recognition.current?.stop();
    setError(null);
    setPhase({ name: "working", step: 1 });
    try {
      const read = await analyzeCheckin(form());
      if (read.status !== "analyzed") {
        setError(read.message);
        setPhase({ name: "write" });
        return;
      }
      setPhase({ name: "working", step: 2 });
      const saved = await commitCheckin(form({ analysis: JSON.stringify(read.analysis) }));
      if (saved.status !== "saved") {
        setError(saved.message);
        setPhase({ name: "write" });
        return;
      }
      setPhase({ name: "recorded", analysis: read.analysis, concern: saved.concern, date: saved.entry.date });
    } catch {
      setError("The request did not come back. Your words are still here; try again.");
      setPhase({ name: "write" });
    }
  }

  if (phase.name === "working") {
    const steps = [
      images.length ? "Reading your words and looking at your picture" : "Reading your words",
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

  if (phase.name === "recorded") {
    return <Recorded analysis={phase.analysis} concern={phase.concern} date={phase.date} />;
  }

  const canSave = text.trim().length > 0 || images.length > 0;
  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Check in</h1>
        <Link href="/patient" className="min-h-11 content-center text-accent underline underline-offset-2">
          Cancel
        </Link>
      </header>

      <section aria-labelledby="q-title" className="flex flex-col gap-3">
        <h2 id="q-title" className="text-lg font-semibold">
          Things worth thinking about first
        </h2>
        {questions === null && (
          <Card>
            <p className="text-muted" role="status">
              Reading your record to find what is worth asking…
            </p>
          </Card>
        )}
        {questions === "none" && (
          <Card>
            <p>How have things been since last time? Take your time.</p>
          </Card>
        )}
        {questions && questions !== "none" && (
          <>
            <ul className="flex flex-col gap-3">
              {questions.questions.map((q) => (
                <li key={q} className="rounded-2xl border border-accent-soft bg-accent-soft p-4 font-medium">
                  {q}
                </li>
              ))}
            </ul>
            <details className="text-sm text-muted">
              <summary className="min-h-8 cursor-pointer">Why these questions?</summary>
              <p className="mt-1">{questions.basedOn}</p>
              <p className="mt-1">{questions.askedBy === "claude" ? "Asked by Claude." : "Asked by the built-in stand-in, not the AI."}</p>
            </details>
          </>
        )}
      </section>

      <section aria-labelledby="say-title" className="flex flex-col gap-3">
        <h2 id="say-title" className="text-lg font-semibold">
          In your own words
        </h2>
        <p className="text-sm text-muted">
          Answer as much or as little as you like. Say how the itching, the comfort and getting about have been. You can write, talk, or add a picture.
        </p>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={7}
          aria-label="Your notes for today"
          className="w-full rounded-2xl border border-line bg-surface p-3 text-base"
        />
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

      {error && (
        <p role="alert" data-testid="checkin-error" className="rounded-xl border border-warn bg-warn-soft p-3 text-warn">
          {error}
        </p>
      )}
      <button type="button" onClick={save} disabled={!canSave} className={`${big} bg-accent text-accent-ink`}>
        Save my check-in
      </button>
    </>
  );
}

function Recorded({ analysis, concern, date }: { analysis: Analysis; concern: boolean; date: string }) {
  const router = useRouter();
  const [scores, setScores] = useState<Scores>(analysis.scores);
  const [editing, setEditing] = useState<MetricKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = METRICS.some((m) => scores[m.key] !== analysis.scores[m.key]);

  async function done() {
    if (!dirty) {
      router.push("/patient");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await correctEntry(date, scores);
    setBusy(false);
    if (result.status === "saved") router.push("/patient");
    else setError(result.message);
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Saved. Here is what I recorded</h1>
      <p className="text-muted">This is how I read what you said. If I got something wrong, change it.</p>

      {concern && (
        <Card className="border-alert bg-alert-soft">
          <p className="font-semibold text-alert">Please contact the clinic</p>
          <p className="mt-1">
            You mentioned something that could be a wound or a sign of infection. That is for the clinic to look at; it is not something to treat at home. I can prepare a request from what you wrote.
          </p>
          <Link href="/patient/clinic/new" className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-alert px-4 font-semibold text-accent-ink">
            Ask for a check-up now
          </Link>
        </Card>
      )}

      <Card>
        <div className="divide-y divide-line">
          {METRICS.map((m) => (
            <div key={m.key} className="py-1">
              {scores[m.key] === null ? (
                <div className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <div className="text-sm text-muted">{m.label}</div>
                    <div className="text-muted">You did not say, so nothing is recorded</div>
                  </div>
                </div>
              ) : (
                <MeasureRow name={m.key} score={scores[m.key]} />
              )}
              <button
                type="button"
                onClick={() => setEditing(editing === m.key ? null : m.key)}
                aria-expanded={editing === m.key}
                className="min-h-11 text-accent underline underline-offset-2"
              >
                {scores[m.key] === null ? `Add ${m.label.toLowerCase()}` : "Change"}
              </button>
              {editing === m.key && (
                <fieldset className="mb-2 mt-1 flex flex-col gap-2">
                  <legend className="sr-only">{m.label}</legend>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={scores[m.key] === n}
                      onClick={() => {
                        setScores((s) => ({ ...s, [m.key]: n }));
                        setEditing(null);
                      }}
                      className={`flex min-h-12 items-center justify-between rounded-xl border px-4 text-left ${scores[m.key] === n ? "border-accent bg-accent-soft font-semibold" : "border-line bg-surface"}`}
                    >
                      {m.words[n - 1]}
                      <Steps score={n} />
                    </button>
                  ))}
                </fieldset>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 border-t border-line pt-2">
          <MeasureRow name="combined" score={combine(scores)} />
          <p className="text-sm text-muted">Put together from the three above.</p>
        </div>
      </Card>

      <p className="text-sm text-muted">
        {analysis.analyzedBy === "claude" ? "Read by Claude." : "Read by the built-in stand-in, which only counts words; it is not the AI."}
        {analysis.rationale && analysis.analyzedBy === "claude" ? ` ${analysis.rationale}` : ""}
      </p>
      {error && (
        <p role="alert" className="rounded-xl border border-warn bg-warn-soft p-3 text-warn">
          {error}
        </p>
      )}
      <button type="button" onClick={done} disabled={busy} className={`${big} bg-accent text-accent-ink`}>
        {busy ? "Saving…" : dirty ? "Save my changes" : "That looks right"}
      </button>
    </>
  );
}

