// One ink line that comes apart into the three metrics: the same thing the
// timeline does when it is opened, drawn still.
export function Strands({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 120" aria-hidden="true" className={className} fill="none" strokeLinecap="round">
      <path d="M4 70 C40 62 70 78 110 66 S150 60 168 62" stroke="var(--color-ink)" strokeWidth="3.5" />
      <path d="M168 62 C200 60 214 26 250 28 S296 40 316 22" stroke="var(--color-itch)" strokeWidth="3" />
      <path d="M168 62 C204 62 222 54 256 62 S298 70 316 56" stroke="var(--color-comfort)" strokeWidth="3" />
      <path d="M168 62 C202 66 220 100 254 98 S294 84 316 102" stroke="var(--color-mobility)" strokeWidth="3" />
      <circle cx="168" cy="62" r="6" fill="var(--color-paper)" stroke="var(--color-ink)" strokeWidth="2.5" />
    </svg>
  );
}
