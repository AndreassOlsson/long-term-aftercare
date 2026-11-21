import Link from "next/link";

const card = "block rounded border border-zinc-300 p-4 hover:bg-zinc-50";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Long-term aftercare</h1>
      <Link href="/patient" className={card}>
        I am a patient
      </Link>
      <Link href="/doctor" className={card}>
        I am a clinician
      </Link>
    </main>
  );
}
