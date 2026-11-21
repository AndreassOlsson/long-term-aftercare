import { isSignedIn } from "@/lib/auth";
import { PATIENTS } from "@/lib/patients";
import { deletePrefix } from "@/lib/storage";

// Puts the stored data back to the starting state: everything the app has
// saved for a patient (entries, questions, pictures, scores, requests, the
// kept summary) goes, and the made-up history stands in again. Clinician
// login only.
export async function POST() {
  if (!(await isSignedIn("doctor"))) return Response.json({ error: "Not logged in" }, { status: 401 });
  let removed = 0;
  for (const patient of PATIENTS.filter((p) => !p.placeholder)) {
    removed += await deletePrefix(`patients/${patient.id}/`);
  }
  return Response.json({ ok: true, removed });
}
