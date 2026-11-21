import { RequestEditor } from "@/components/patient/request-editor";
import { getEntries } from "@/lib/entries";
import { PATIENTS } from "@/lib/patients";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const entries = await getEntries(PATIENTS[0].id);
  // The pictures she could attach: those in her record, newest first.
  const pictures = entries
    .flatMap((e) => e.images.map((key) => ({ key, date: e.date })))
    .reverse()
    .slice(0, 12);
  return <RequestEditor raisedBy={from === "suggested" ? "suggested" : "patient"} pictures={pictures} />;
}
