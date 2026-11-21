import { History } from "@/components/patient/history";
import { getEntries } from "@/lib/entries";
import { PATIENTS } from "@/lib/patients";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { day } = await searchParams;
  const entries = await getEntries(PATIENTS[0].id);
  const initialDay = day && entries.some((e) => e.date === day) ? day : null;
  return (
    <>
      <h1 className="text-2xl font-semibold">Your history</h1>
      <p className="-mt-3 text-muted">How well your prosthesis has been working. Higher on the graph is better.</p>
      <History entries={entries} initialDay={initialDay} />
    </>
  );
}
