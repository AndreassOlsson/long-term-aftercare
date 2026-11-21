const way = "group flex min-h-24 flex-col justify-center gap-1 rounded-2xl border p-5 transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-10">
      <header className="flex flex-col gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-ink" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h4l3-7 4 14 3-7h4" />
          </svg>
        </span>
        <h1 className="text-4xl font-semibold tracking-tight">Long-term aftercare</h1>
        <p className="text-lg text-muted">
          A short daily check-in for life with a prosthesis or orthosis, and a clear record for the clinic that follows it over the years.
        </p>
      </header>
      <nav aria-label="Choose your side" className="flex flex-col gap-3">
        <a href="/patient" className={`${way} border-accent bg-accent text-accent-ink`}>
          <span className="text-xl font-semibold">I am a patient</span>
          <span className="text-sm opacity-90">Check in, see how it has been, ask the clinic</span>
        </a>
        <a href="/doctor" className={`${way} border-line bg-surface text-ink`}>
          <span className="text-xl font-semibold">I am a clinician</span>
          <span className="text-sm text-muted">Read your patients&apos; records and answer requests</span>
        </a>
      </nav>
    </main>
  );
}
