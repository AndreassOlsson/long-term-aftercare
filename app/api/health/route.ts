// Open this after a deploy to see which commit is live and which
// environment variables the deployment can see. Values are never returned.
export const dynamic = "force-dynamic";

export function GET() {
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
      ANTHROPIC_API_KEY: has("ANTHROPIC_API_KEY"),
    },
  });
}
