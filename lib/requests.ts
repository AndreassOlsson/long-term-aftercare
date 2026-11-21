import { getObject, listKeys, putObject } from "./storage";

// A request for a check-up: the one thing that travels from the patient's
// side to the clinician's and back. The patient's side prepares and sends
// it; the clinician's side reads it and answers; the patient's side shows
// the answer. Both sides are built against this file, so change its shapes
// only together with both.

export type RequestStatus = "sent" | "seen" | "answered" | "handled";

export type RequestReply = {
  kind: "offer_time" | "question" | "advice";
  /** What the clinician wrote to the patient. */
  text: string;
  /** For offer_time: the proposed appointment, as an ISO date-time. */
  proposedTime: string | null;
  at: string;
};

export type CheckupRequest = {
  id: string;
  patientId: string;
  createdAt: string;
  updatedAt: string;
  status: RequestStatus;
  /** One line for the inbox: why this needs looking at. */
  headline: string;
  /** The request as the patient sent it: what has changed and since when, in plain text. */
  body: string;
  /** The days (YYYY-MM-DD) the request rests on; each can be opened in the record. */
  evidenceDates: string[];
  /** Storage keys of the pictures the patient chose to attach. */
  images: string[];
  /** Whether the patient asked themselves or accepted the app's proposal to ask. */
  raisedBy: "patient" | "suggested";
  reply: RequestReply | null;
};

const prefix = (patientId: string) => `patients/${patientId}/requests/`;

// Every change is written as a new file and the newest version of each
// request wins, so a read never sees a stale copy.
async function versions(patientId: string): Promise<CheckupRequest[]> {
  const keys = await listKeys(prefix(patientId));
  const objects = await Promise.all(keys.map((key) => getObject(key)));
  return objects
    .filter((o) => o !== null)
    .map((o) => JSON.parse(o.body.toString("utf8")) as CheckupRequest);
}

/** A patient's requests, newest first. */
export async function listRequests(patientId: string): Promise<CheckupRequest[]> {
  const latest = new Map<string, CheckupRequest>();
  for (const r of (await versions(patientId)).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
    latest.set(r.id, r);
  }
  return [...latest.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getRequest(patientId: string, id: string): Promise<CheckupRequest | null> {
  return (await listRequests(patientId)).find((r) => r.id === id) ?? null;
}

/** Saves a new request or a new state of an existing one. Sets updatedAt. */
export async function saveRequest(request: CheckupRequest): Promise<CheckupRequest> {
  const saved = { ...request, updatedAt: new Date().toISOString() };
  const stamp = saved.updatedAt.replace(/[^0-9]/g, "");
  await putObject(
    `${prefix(saved.patientId)}${saved.id}-${stamp}.json`,
    JSON.stringify(saved, null, 2),
    "application/json",
  );
  return saved;
}
