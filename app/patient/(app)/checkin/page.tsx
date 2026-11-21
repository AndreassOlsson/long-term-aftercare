import { Checkin } from "@/components/patient/checkin";
import { today } from "@/lib/dates";
import { getEntries } from "@/lib/entries";
import { PATIENTS } from "@/lib/patients";

// The agents run inside this page's actions and can take a while.
export const maxDuration = 300;
// Today's saved entry is read on every visit: opening the check-in again shows what was saved.
export const dynamic = "force-dynamic";

export default async function Page() {
  const date = today();
  const existing = (await getEntries(PATIENTS[0].id)).find((e) => e.date === date && e.analyzedBy !== "seed") ?? null;
  return <Checkin existing={existing} />;
}
