import Link from "next/link";
import { Strands } from "@/components/strands";

const door =
  "group flex items-center justify-between gap-4 border-t border-rule py-5 text-left transition-colors hover:text-ink-soft";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-12">
      <Strands className="mx-auto mb-8 w-full max-w-xs" />
      <h1 className="text-center text-[2.25rem] font-bold leading-[1.1] tracking-[-0.01em]">Long-term aftercare</h1>
      <p className="mx-auto mt-3 max-w-[34ch] text-center text-lg leading-relaxed text-slate">
        A few lines a day about life with your prosthesis or orthosis, read by
        the clinician who fitted it.
      </p>

      <nav className="mt-10 flex flex-col border-b border-rule">
        <Link href="/patient" className={door}>
          <span>
            <span className="block text-xl font-semibold">Write in my diary</span>
            <span className="mt-0.5 block text-slate">For the person wearing it</span>
          </span>
          <Chevron />
        </Link>
        <Link href="/doctor" className={door}>
          <span>
            <span className="block text-xl font-semibold">Read my patients&apos; diaries</span>
            <span className="mt-0.5 block text-slate">For the clinician</span>
          </span>
          <Chevron />
        </Link>
      </nav>
    </main>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-6 w-6 shrink-0 transition-transform group-hover:translate-x-1"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}
