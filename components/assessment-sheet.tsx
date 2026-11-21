"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { submitAssessment } from "@/lib/assessment";
import { METRICS, SCORE_MAX, SCORE_MIN, type Scores } from "@/lib/metrics";
import type { Entry } from "@/lib/types";

const MAX_IMAGES = 3;
const MAX_SIDE = 1280;
const SCORE_STEPS = Array.from({ length: SCORE_MAX - SCORE_MIN + 1 }, (_, i) => SCORE_MIN + i);

/** Shrinks a photo in the browser so three of them fit in one upload. */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8),
    );
    return blob ? new File([blob], "picture.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

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
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** A picture in the form: one already saved today (key) or a new one (file). */
type Picture = { url: string; key: string; file?: never } | { url: string; file: File; key?: never };

export function AssessmentSheet({
  existing,
  questions,
  onClose,
  onSaved,
}: {
  /** Today's saved entry, when the patient is correcting it. */
  existing: Entry | null;
  /** Today's targeted questions; null while they are still being prepared. */
  questions: string[] | null;
  onClose: () => void;
  onSaved: (entry: Entry) => void;
}) {
  const [text, setText] = useState(existing?.text ?? "");
  const [images, setImages] = useState<Picture[]>(
    () =>
      existing?.images.map((key) => ({ key, url: `/api/images?key=${encodeURIComponent(key)}` })) ?? [],
  );
  const [ownScores, setOwnScores] = useState<Partial<Scores>>(existing?.ownScores ?? {});
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [canTalk, setCanTalk] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const textBox = useGrow(text);
  const answerBox = useGrow(answer);
  const fileInput = useRef<HTMLInputElement>(null);

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
      if (!heard.trim()) return;
      const add = (previous: string) => (previous ? `${previous.trimEnd()} ` : "") + heard.trim();
      if (question) setAnswer(add);
      else setText(add);
    };
    r.onend = () => setListening(false);
    recognition.current = r;
    r.start();
    setListening(true);
  }

  async function addPictures(files: FileList | null) {
    if (!files) return;
    const room = MAX_IMAGES - images.length;
    const shrunk = await Promise.all([...files].slice(0, room).map(shrink));
    setImages((current) => [
      ...current,
      ...shrunk.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit(skip: boolean) {
    recognition.current?.stop();
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("text", text);
    for (const m of METRICS) {
      const value = ownScores[m.key];
      if (value != null) form.set(`score_${m.key}`, String(value));
    }
    for (const image of images) {
      if (image.file) form.append("images", image.file);
      else form.append("keepImages", image.key);
    }
    if (question) {
      form.set("followUpQuestion", question);
      if (!skip) form.set("followUpAnswer", answer);
    }
    let result;
    try {
      result = await submitAssessment(form);
    } catch {
      result = {
        status: "error" as const,
        message:
          "The request did not come back. If the app was just updated, reload the page and try again; your text is kept below until you do.",
      };
    }
    setBusy(false);
    if (result.status === "saved") onSaved(result.entry);
    else if (result.status === "followup") setQuestion(result.question);
    else setError(result.message);
  }

  const box = "w-full resize-none overflow-hidden rounded-2xl border border-zinc-400 p-3 text-base";
  const button = "w-full rounded-xl border border-zinc-400 px-3 py-3 font-medium disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/30 p-3 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assessment-title"
        className="flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto overscroll-contain rounded-3xl bg-white p-5 *:shrink-0"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="assessment-title" className="text-lg font-semibold">
            {existing ? "Update today's assessment" : "Today's assessment"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-lg leading-none">
            ✕
          </button>
        </div>

        {question === null ? (
          <>
            {existing && (
              <p className="text-sm text-zinc-600">
                This is what you saved earlier today. Change the scores or the
                text, remove a picture by tapping it, or add another, then
                press Done to save it again.
              </p>
            )}
            <p className="text-sm text-zinc-700">
              Express freely with text or images about your experience with the
              prosthesis. Please talk about{" "}
              {METRICS.map((m) => m.label.toLowerCase()).join(", ")}.
            </p>
            <div className="rounded-2xl bg-zinc-100 p-3 text-sm">
              <p className="font-medium">How are you doing today?</p>
              {questions === null ? (
                <p className="mt-1 text-zinc-500">Looking at your timeline for more to ask…</p>
              ) : (
                <ul className="mt-1 list-disc pl-5">
                  {questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              )}
            </div>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-sm text-zinc-700">
                Score today yourself, if you like (1 is worst, 5 is best). Tap
                a chosen score again to clear it.
              </legend>
              {METRICS.map((m) => (
                <div key={m.key} className="flex flex-col gap-1">
                  <span className="text-sm font-medium" id={`score-${m.key}`}>
                    {m.label}
                  </span>
                  <div role="group" aria-labelledby={`score-${m.key}`} className="flex gap-2">
                    {SCORE_STEPS.map((value) => {
                      const chosen = ownScores[m.key] === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={chosen}
                          aria-label={`${m.label} ${value} of ${SCORE_MAX}`}
                          disabled={busy}
                          onClick={() =>
                            setOwnScores((current) => ({ ...current, [m.key]: chosen ? null : value }))
                          }
                          className={`h-11 flex-1 rounded-xl border font-medium ${
                            chosen ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-400"
                          }`}
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </fieldset>
            <textarea
              ref={textBox}
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={6}
              aria-label="Your notes for today"
              className={box}
            />
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {images.map((image, i) => (
                  <button
                    key={image.url}
                    type="button"
                    onClick={() => setImages((current) => current.filter((_, j) => j !== i))}
                    aria-label={`Remove picture ${i + 1}`}
                    className="relative"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                    <span className="absolute -right-1 -top-1 rounded-full bg-white px-1 text-xs">✕</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-700">One more thing, if you like:</p>
            <p className="font-medium">{question}</p>
            <textarea
              ref={answerBox}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={4}
              aria-label="Your answer"
              className={box}
            />
          </>
        )}

        {canTalk && (
          <button type="button" onClick={toggleTalk} disabled={busy} className={button}>
            {listening ? "Stop talking" : "Talk"}
          </button>
        )}
        {question === null && (
          <>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              hidden
              onChange={(event) => addPictures(event.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy || images.length >= MAX_IMAGES}
              className={button}
            >
              Take a picture
            </button>
          </>
        )}

        {error && <p className="text-sm text-red-700">{error}</p>}

        <div className="flex gap-2">
          {question !== null && (
            <button type="button" onClick={() => submit(true)} disabled={busy} className={button}>
              Skip
            </button>
          )}
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={
              busy ||
              (question === null
                ? !text.trim() && images.length === 0 && !METRICS.some((m) => ownScores[m.key] != null)
                : !answer.trim())
            }
            className={`${button} bg-zinc-900 text-white`}
          >
            {busy ? "Working on it…" : question === null ? "Done" : "Answer"}
          </button>
        </div>
      </div>
    </div>
  );
}
