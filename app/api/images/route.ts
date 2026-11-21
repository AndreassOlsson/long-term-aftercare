import { isSignedIn } from "@/lib/auth";
import { getObject } from "@/lib/storage";

// Serves a stored picture to whoever is logged in, patient or clinician.
export async function GET(request: Request) {
  if (!(await isSignedIn("patient")) && !(await isSignedIn("doctor"))) {
    return new Response("Not logged in", { status: 401 });
  }
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!/^patients\/[a-z0-9-]+\/images\/[a-z0-9-]+\.jpg$/.test(key)) {
    return new Response("Not found", { status: 404 });
  }
  const object = await getObject(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(object.body), {
    headers: {
      "Content-Type": object.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
