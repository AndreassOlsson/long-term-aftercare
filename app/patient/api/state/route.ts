import { isSignedIn } from "@/lib/auth";
import { today } from "@/lib/dates";
import { getEntries } from "@/lib/entries";
import { PATIENTS } from "@/lib/patients";
import { listRequests } from "@/lib/requests";

export const dynamic = "force-dynamic";

// What the record holds, for the patient who is logged in. The browser check
// (scripts/check-patient.mjs) reads this to prove what was and was not saved.
export async function GET() {
  if (!(await isSignedIn("patient"))) return new Response("Not logged in", { status: 401 });
  const id = PATIENTS[0].id;
  const [entries, requests] = await Promise.all([getEntries(id), listRequests(id)]);
  return Response.json({
    entries: entries.filter((e) => e.analyzedBy !== "seed").map((e) => ({ date: e.date, text: e.text, scores: e.scores, images: e.images, analyzedBy: e.analyzedBy, ownScores: e.ownScores ?? {}, combined: e.combined, followUp: e.followUp })),
    entryCount: entries.length,
    // The made-up history's pictures, to show which photo each day carries.
    seedPictures: entries.filter((e) => e.analyzedBy === "seed" && e.images.length).map((e) => ({ date: e.date, key: e.images[0] })),
    today: today(),
    dates: entries.map((e) => e.date),
    requests,
  });
}
