import { isSignedIn } from "@/lib/auth";
import { buildRequestPdf } from "@/lib/request-pdf";

export const dynamic = "force-dynamic";

// The check-up request as a PDF. The patient gets her own; the clinician gets
// any patient's. `?patient=<id>&id=<request id>`.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const doctor = await isSignedIn("doctor");
  const patient = await isSignedIn("patient");
  if (!doctor && !patient) return new Response("Not logged in", { status: 401 });
  const patientId = doctor ? (url.searchParams.get("patient") ?? "maria") : "maria";
  const id = url.searchParams.get("id") ?? "";
  if (!/^[a-z0-9-]+$/i.test(id) || !/^[a-z0-9-]+$/.test(patientId)) return new Response("Not found", { status: 404 });
  const built = await buildRequestPdf(patientId, id, url.origin);
  if (!built) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(built.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${built.name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
