"use client";

import { useEffect, useRef, useState } from "react";
import { seenAnswers } from "./seen";

// The patient's side is one page per section, stacked, and the page scrolls
// as any page does: no snapping. Home is exactly one screen tall; the others
// are at least one screen and grow with their content. The bar at the foot
// says where she is and goes to a section with one tap.

export type PagerSection = { id: string; label: string; icon: string; content: React.ReactNode };

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Pager({ sections, answered }: { sections: PagerSection[]; answered: { id: string; updatedAt: string }[] }) {
  const [here, setHere] = useState(sections[0].id);
  const [fresh, setFresh] = useState(0);
  const first = useRef(true);

  useEffect(() => {
    // Which section is on screen: more than half of it in the viewport is the one she is in.
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setHere(e.target.id);
      },
      { threshold: 0.5 },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) seen.observe(el);
    }
    // A deep link (#history, or /patient/history sent here) lands on its section, without a glide.
    const arrive = () => {
      const id = location.hash.slice(1);
      if (sections.some((s) => s.id === id)) document.getElementById(id)?.scrollIntoView({ behavior: "auto", block: "start" });
    };
    if (first.current) {
      first.current = false;
      arrive();
    }
    addEventListener("hashchange", arrive);
    return () => {
      seen.disconnect();
      removeEventListener("hashchange", arrive);
    };
  }, [sections]);

  useEffect(() => {
    const update = () => {
      const read = seenAnswers();
      setFresh(answered.filter((a) => read[a.id] !== a.updatedAt).length);
    };
    update();
    addEventListener("lta-seen", update);
    return () => removeEventListener("lta-seen", update);
  }, [answered]);

  function go(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  }

  return (
    <>
      {sections.map((s) => (
        <section
          key={s.id}
          id={s.id}
          data-page={s.id}
          aria-label={s.label}
          tabIndex={-1}
          className={`outline-none ${s.id === "home" ? "h-dvh overflow-hidden" : "min-h-dvh"}`}
        >
          <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 px-4 pb-24 pt-5">{s.content}</div>
        </section>
      ))}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex max-w-md">
          {sections.map((s) => {
            const active = here === s.id;
            return (
              <li key={s.id} className="flex-1">
                <button
                  type="button"
                  onClick={() => go(s.id)}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-h-16 w-full flex-col items-center justify-center gap-1 text-xs ${active ? "font-semibold text-accent" : "text-muted"}`}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={s.icon} />
                  </svg>
                  {s.label}
                  {s.id === "clinic" && fresh > 0 && (
                    <span className="absolute right-[26%] top-2 rounded-full bg-alert px-1.5 text-xs font-semibold text-accent-ink" aria-label={`${fresh} new answer`}>
                      {fresh}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
