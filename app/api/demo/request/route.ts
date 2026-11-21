import { addDays, today } from "@/lib/dates";
import { isSignedIn } from "@/lib/auth";
import { getRequest, saveRequest, type CheckupRequest } from "@/lib/requests";

// For the demo and for checking the clinician's side without the patient's:
// POST saves a sample check-up request for Maria through the same
// saveRequest the patient's side uses, GET reads one back through getRequest.
// Clinician login only.

const PATIENT = "maria";

export async function POST() {
  if (!(await isSignedIn("doctor"))) return Response.json({ error: "Not logged in" }, { status: 401 });
  const now = new Date().toISOString();
  const request: CheckupRequest = {
    id: "sample-request",
    patientId: PATIENT,
    createdAt: now,
    updatedAt: now,
    status: "sent",
    headline: "Comfort and mobility have fallen for two weeks; the socket rubs and feels looser",
    body: "Over the last two weeks the socket has started to rub on the outside of my knee and it feels looser than before. I get a red mark when I take it off and the skin is irritated and itchy there. I have started to shorten my walks and skip my evening one. I would like to be seen.",
    evidenceDates: [-12, -8, -5, -3, -1].map((n) => addDays(today(), n)),
    images: [],
    raisedBy: "suggested",
    reply: null,
  };
  const saved = await saveRequest(request);
  return Response.json({ ok: true, request: saved });
}

export async function GET(request: Request) {
  if (!(await isSignedIn("doctor"))) return Response.json({ error: "Not logged in" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const found = await getRequest(PATIENT, id);
  if (!found) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(found);
}
