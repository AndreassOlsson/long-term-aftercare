"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { analyzeCheckin, commitCheckin, removeTodaysCheckin, todaysQuestions } from "@/lib/assessment";
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
  | { name: "recorded"; entry: Entry; concern: boolean };

const big = "flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-lg font-semibold disabled:opacity-50";

/**
 * The one form for today's check-in. Opened fresh it makes the entry; opened
 * again (with `existing`, today's saved entry) it shows what was saved and
 * saving replaces it. Her own scores are picked on the same labelled scale
 * the record is read in.
 */
export function Checkin({ existing }: { existing: Entry | null }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "write" });
  const [saved, setSaved] = useState<Entry | null>(existing);
  const [questions, setQuestions] = useState<QuestionSet | null | "none">(null);
  const [text, setText] = useState(existing?.text ?? "");
  const [images, setImages] = useState<Picture[]>(() => existing?.images.map(pictureOf) ?? []);
  const [own, setOwn] = useState<Partial<Scores>>(existing?.ownScores ?? {});
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
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
      const result = await commitCheckin(form({ analysis: JSON.stringify(read.analysis) }));
      if (result.status !== "saved") {
        setError(result.message);
        setPhase({ name: "write" });
        return;
      }
      setSaved(result.entry);
      setPhase({ name: "recorded", entry: result.entry, concern: result.concern });
    } catch {
      setError("The request did not come back. Your words are still here; try again.");
      setPhase({ name: "write" });
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

  if (phase.name === "recorded") {
    return (
      <Recorded
        entry={phase.entry}
        concern={phase.concern}
        onChange={() => {
          // The same form again, filled in with what was just saved.
          setText(phase.entry.text);
          setImages(phase.entry.images.map(pictureOf));
          setOwn(phase.entry.ownScores ?? {});
          setPhase({ name: "write" });
        }}
      />
    );
  }

  const canSave = text.trim().length > 0 || images.length > 0 || ownKeys(own).length > 0;

  async function remove() {
    setRemoving(true);
    setError(null);
    const result = await removeTodaysCheckin();
    setRemoving(false);
    setConfirmRemove(false);
    if (result.status === "removed") router.push("/patient");
    else setError(result.message);
  }
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
          ref={textBox}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={7}
          aria-label="Your notes for today"
          className="w-full resize-none overflow-hidden rounded-2xl border border-line bg-surface p-3 text-base"
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

      <section aria-labelledby="own-title" className="flex flex-col gap-3">
        <h2 id="own-title" className="text-lg font-semibold">
          Or score it yourself
        </h2>
        <p className="text-sm text-muted">
          If you like, say how each one has been. What you pick is what is recorded, and it is marked as yours. Whatever you leave open is read from your words and pictures.
        </p>
        <Card>
          <div className="divide-y divide-line">
            {METRICS.map((m) => (
              <ScorePicker key={m.key} metric={m} value={own[m.key] ?? null} onChange={(value) => setOwn((current) => ({ ...current, [m.key]: value }))} />
            ))}
          </div>
        </Card>
      </section>

      {error && (
        <p role="alert" data-testid="checkin-error" className="rounded-xl border border-warn bg-warn-soft p-3 text-warn">
          {error}
        </p>
      )}
      <button type="button" onClick={save} disabled={!canSave} className={`${big} bg-accent text-accent-ink`}>
        {saved ? "Save my changes" : "Save my check-in"}
      </button>
      {saved && (
        <div className="flex flex-col gap-2">
          {confirmRemove ? (
            <div role="alertdialog" aria-label="Remove today’s check-in" className="flex flex-col gap-2 rounded-2xl border border-alert bg-alert-soft p-4">
              <p>Remove today’s check-in? Its words, pictures and scores are taken out of your record and your history, as if you had not checked in today.</p>
              <div className="flex gap-3">
                <button type="button" onClick={remove} disabled={removing} className="min-h-12 flex-1 rounded-xl bg-alert px-4 font-semibold text-accent-ink disabled:opacity-50">
                  {removing ? "Removing…" : "Yes, remove it"}
                </button>
                <button type="button" onClick={() => setConfirmRemove(false)} disabled={removing} className="min-h-12 flex-1 rounded-xl border border-line bg-surface px-4 font-semibold">
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmRemove(true)} className="min-h-12 rounded-xl border border-line bg-surface px-4 font-medium text-alert">
              Remove today’s check-in
            </button>
          )}
        </div>
      )}
    </>
  );
}

function Recorded({ entry, concern, onChange }: { entry: Entry; concern: boolean; onChange: () => void }) {
  const router = useRouter();
  const own = ownKeys(entry.ownScores);
  const everything = scoredEverything(entry.ownScores);

  return (
    <>
      <h1 className="text-2xl font-semibold">Saved. Here is what I recorded</h1>
      <p className="text-muted">
        {everything ? "You scored all three yourself, so this is exactly what you picked." : "This is how I read what you said, with what you picked yourself. If something is wrong, change it."}
      </p>

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
              {entry.scores[m.key] === null ? (
                <div className="py-2">
                  <div className="text-sm text-muted">{m.label}</div>
                  <div className="text-muted">Not recorded: you did not say. Change the check-in to add it.</div>
                </div>
              ) : (
                <>
                  <MeasureRow name={m.key} score={entry.scores[m.key]} />
                  {own.includes(m.key) && <p className="-mt-1 pb-1 text-sm text-muted">You picked this one.</p>}
                </>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 border-t border-line pt-2">
          <MeasureRow name="combined" score={combine(entry.scores)} />
          <p className="text-sm text-muted">Put together from the three above.</p>
        </div>
      </Card>

      <p className="text-sm text-muted">
        {everything
          ? "Scored by you."
          : entry.analyzedBy === "claude"
            ? `The rest was read by Claude. ${entry.rationale}`
            : entry.analyzedBy === "dummy"
              ? "The rest was read by the built-in stand-in, which only counts words; it is not the AI."
              : "Scored by you."}
      </p>
      <button type="button" onClick={() => router.push("/patient")} className={`${big} bg-accent text-accent-ink`}>
        That looks right
      </button>
      <button type="button" onClick={onChange} className={`${big} border border-line bg-surface`}>
        Change this check-in
      </button>
    </>
  );
}
