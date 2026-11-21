"use client";

import { useEffect, useRef, useState } from "react";
import { submitAssessment } from "@/lib/assessment";
import { METRICS } from "@/lib/metrics";
import { METRIC_COLOR } from "./metric-colors";
import type { Entry } from "@/lib/types";

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
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8),
    );
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
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function AssessmentSheet({
  questions,
  onClose,
  onSaved,
}: {
  /** Today's targeted questions; null while they are still being prepared. */
  questions: string[] | null;
  onClose: () => void;
  onSaved: (entry: Entry) => void;
}) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<{ file: File; url: string }[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [canTalk, setCanTalk] = useState(false);
  const recognition = useRef<Recognition | null>(null);
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
    for (const image of images) form.append("images", image.file);
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
          "Your entry did not reach the server. Reload the page and save again. Copy your text first, since reloading clears it.",
      };
    }
    setBusy(false);
    if (result.status === "saved") onSaved(result.entry);
    else if (result.status === "followup") setQuestion(result.question);
    else setError(result.message);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const voice =
    "w-full resize-y rounded-xl border-2 border-rule bg-paper px-4 py-3 font-voice text-[1.125rem] leading-[1.6] outline-none placeholder:text-slate/70 focus:border-ink";
  const tool =
    "flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-ink px-3 py-3 font-semibold hover:bg-paper disabled:border-rule disabled:text-slate";
  const primary =
    "flex-[2] rounded-xl bg-ink px-4 py-3.5 text-lg font-semibold text-paper hover:bg-ink-soft disabled:bg-rule disabled:text-slate";
  const canSave = question === null ? Boolean(text.trim()) || images.length > 0 : Boolean(answer.trim());

  return (
    <div className="fixed inset-0 z-10 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assessment-title"
        className="flex max-h-[94dvh] w-full max-w-md flex-col gap-5 overflow-y-auto rounded-t-[28px] bg-plaster px-5 pb-6 pt-3 shadow-[0_-8px_40px_rgba(28,43,57,0.25)] sm:rounded-[28px] sm:pt-5"
      >
        <div aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-rule sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <h2 id="assessment-title" className="text-2xl font-bold leading-tight">
            {question === null ? "Today\u2019s entry" : "One more question"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close without saving"
            className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-paper"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {question === null ? (
          <>
            <div>
              <p className="leading-relaxed text-slate">
                Write, or say, how it has been. Mention{" "}
                {METRICS.map((m, i) => (
                  <span key={m.key}>
                    {i > 0 && (i === METRICS.length - 1 ? " and " : ", ")}
                    <span className="font-semibold" style={{ color: METRIC_COLOR[m.key] }}>
                      {m.label.toLowerCase()}
                    </span>
                  </span>
                ))}{" "}
                if you can.
              </p>
              {questions === null ? (
                <p className="mt-3 text-slate">Reading your earlier entries for things to ask…</p>
              ) : (
                questions.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-2">
                    {questions.map((q) => (
                      <li key={q} className="border-l-[3px] border-ink pl-3 leading-snug">
                        {q}
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={6}
              aria-label="Your notes for today"
              placeholder="Today the socket felt…"
              className={voice}
            />
            {images.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {images.map((image, i) => (
                  <button
                    key={image.url}
                    type="button"
                    onClick={() => setImages((current) => current.filter((_, j) => j !== i))}
                    aria-label={`Remove picture ${i + 1}`}
                    className="relative"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                    <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs text-paper">
                      ✕
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-lg font-semibold leading-snug">{question}</p>
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={4}
              aria-label="Your answer"
              className={voice}
            />
          </>
        )}

        {(canTalk || question === null) && (
          <div className="flex gap-3">
            {canTalk && (
              <button
                type="button"
                onClick={toggleTalk}
                disabled={busy}
                aria-pressed={listening}
                className={`${tool} ${listening ? "border-itch bg-paper text-itch" : ""}`}
              >
                {listening ? (
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-itch" aria-hidden="true" />
                ) : (
                  <MicIcon />
                )}
                {listening ? "Stop" : "Speak"}
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
                  className={tool}
                >
                  <CameraIcon />
                  {images.length >= MAX_IMAGES ? "3 pictures" : "Add picture"}
                </button>
              </>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-paper px-4 py-3 leading-relaxed text-alert">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          {question !== null && (
            <button type="button" onClick={() => submit(true)} disabled={busy} className={tool}>
              Skip
            </button>
          )}
          <button type="button" onClick={() => submit(false)} disabled={busy || !canSave} className={primary}>
            {busy ? "Reading your entry…" : question === null ? "Save entry" : "Save answer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
