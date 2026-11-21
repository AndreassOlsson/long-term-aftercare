"use client";

import { useEffect, useRef, useState } from "react";
import { submitAssessment } from "@/lib/assessment";
import { METRICS } from "@/lib/metrics";
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
          "The request did not come back. If the app was just updated, reload the page and try again; your text is kept below until you do.",
      };
    }
    setBusy(false);
    if (result.status === "saved") onSaved(result.entry);
    else if (result.status === "followup") setQuestion(result.question);
    else setError(result.message);
  }

  const box = "w-full rounded-2xl border border-zinc-400 p-3 text-base";
  const button = "w-full rounded-xl border border-zinc-400 px-3 py-3 font-medium disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/30 p-3 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assessment-title"
        className="flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto rounded-3xl bg-white p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="assessment-title" className="text-lg font-semibold">
            Today&apos;s assessment
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-lg leading-none">
            ✕
          </button>
        </div>

        {question === null ? (
          <>
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
            <textarea
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
            disabled={busy || (question === null ? !text.trim() && images.length === 0 : !answer.trim())}
            className={`${button} bg-zinc-900 text-white`}
          >
            {busy ? "Working on it…" : question === null ? "Done" : "Answer"}
          </button>
        </div>
      </div>
    </div>
  );
}
