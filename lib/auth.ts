import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Two fixed accounts, one password each, both set as environment variables.
// There is no user table: this is a proof of concept with one mock patient.
export type Role = "patient" | "doctor";

const PASSWORD_ENV: Record<Role, string> = {
  patient: "PATIENT_PASSWORD",
  doctor: "DOCTOR_PASSWORD",
};

const cookieName = (role: Role) => `lta_${role}`;

function sign(role: Role): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(`role:${role}`).digest("hex");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function isConfigured(role: Role): boolean {
  return Boolean(process.env[PASSWORD_ENV[role]] && process.env.SESSION_SECRET);
}

export async function isSignedIn(role: Role): Promise<boolean> {
  const expected = sign(role);
  const actual = (await cookies()).get(cookieName(role))?.value;
  return Boolean(expected && actual && same(actual, expected));
}

/** Use at the top of every protected page. */
export async function requireRole(role: Role): Promise<void> {
  if (!(await isSignedIn(role))) redirect(`/${role}/login`);
}

export async function signIn(role: Role, password: string): Promise<boolean> {
  const expected = process.env[PASSWORD_ENV[role]];
  const token = sign(role);
  if (!expected || !token || !same(password, expected)) return false;
  (await cookies()).set(cookieName(role), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return true;
}

export async function signOut(role: Role): Promise<void> {
  (await cookies()).delete(cookieName(role));
}
