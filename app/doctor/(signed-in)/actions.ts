"use server";

import { revalidatePath } from "next/cache";
import { fromLocalInput } from "@/components/clinician/format";
import { isSignedIn } from "@/lib/auth";
import { getPatient } from "@/lib/patients";
import { getRequest, saveRequest, type RequestReply } from "@/lib/requests";

// Server actions are public endpoints, so each one checks the clinician login
// itself and never trusts what the page sent.

async function load(patientId: string, id: string) {
  if (!(await isSignedIn("doctor"))) throw new Error("Not logged in");
  const patient = getPatient(patientId);
  if (!patient || patient.placeholder) throw new Error("Unknown patient");
  const request = await getRequest(patientId, id);
  if (!request) throw new Error("Unknown request");
  return request;
}

function refresh(patientId: string, id: string) {
  revalidatePath("/doctor");
  revalidatePath(`/doctor/patients/${patientId}/requests/${id}`);
}

/** Opening a request marks it seen. Only a request still waiting changes. */
export async function markSeen(patientId: string, id: string): Promise<void> {
  const request = await load(patientId, id);
  if (request.status !== "sent") return;
  await saveRequest({ ...request, status: "seen" });
  refresh(patientId, id);
}

export type AnswerInput = {
  kind: RequestReply["kind"];
  text: string;
  /** For an offered time: a datetime-local value in Swedish time. */
  proposedLocal?: string;
};

export type AnswerResult = { ok: true } | { ok: false; error: string };

export async function answerRequest(patientId: string, id: string, input: AnswerInput): Promise<AnswerResult> {
  const request = await load(patientId, id);
  if (!["offer_time", "question", "advice"].includes(input.kind)) return { ok: false, error: "Unknown kind of answer." };
  const text = String(input.text ?? "").trim().slice(0, 2000);
  let proposedTime: string | null = null;
  if (input.kind === "offer_time") {
    proposedTime = fromLocalInput(String(input.proposedLocal ?? ""));
    if (!proposedTime) return { ok: false, error: "Pick a date and time to offer." };
  } else if (!text) {
    return { ok: false, error: input.kind === "question" ? "Write the question to ask." : "Write the advice to give." };
  }
  const reply: RequestReply = {
    kind: input.kind,
    text,
    proposedTime,
    at: new Date().toISOString(),
  };
  await saveRequest({ ...request, status: "answered", reply });
  refresh(patientId, id);
  return { ok: true };
}

/** Closes the request with no reply, or after the reply it already has. */
export async function markHandled(patientId: string, id: string): Promise<void> {
  const request = await load(patientId, id);
  await saveRequest({ ...request, status: "handled" });
  refresh(patientId, id);
}
