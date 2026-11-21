// Open this after a deploy to see which commit is live and which
// environment variables the deployment can see. Values are never returned.
import { getObject, putObject, storageKind } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Writes a small fixed file and reads it back: proves the store really works. */
async function storageRoundTrip(): Promise<string> {
  try {
    const stamp = new Date().toISOString();
    await putObject("health/ping.txt", stamp, "text/plain");
    const back = await getObject("health/ping.txt", { fresh: true });
    return back?.body.toString("utf8") === stamp ? "ok" : "wrote, but read back something else";
  } catch (error) {
    return `failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function GET(request: Request) {
  const has = (name: string) => Boolean(process.env[name]);
  return Response.json({
    ok: true,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    environment: process.env.VERCEL_ENV ?? "local",
    configured: {
      PATIENT_PASSWORD: has("PATIENT_PASSWORD"),
      DOCTOR_PASSWORD: has("DOCTOR_PASSWORD"),
      SESSION_SECRET: has("SESSION_SECRET"),
      BLOB_READ_WRITE_TOKEN: has("BLOB_READ_WRITE_TOKEN"),
      BLOB_STORE_ID: has("BLOB_STORE_ID"),
      ANTHROPIC_API_KEY: has("ANTHROPIC_API_KEY"),
    },
    storage: storageKind(),
    // Only with ?check=storage, since it writes.
    storageRoundTrip:
      new URL(request.url).searchParams.get("check") === "storage"
        ? await storageRoundTrip()
        : "not run",
    // Names only: helps spot a variable saved under a slightly different name.
    relatedNames: Object.keys(process.env)
      .filter((name) => /BLOB|ANTHROPIC|CLAUDE/i.test(name))
      .sort(),
  });
}
