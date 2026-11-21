"use server";

import { redirect } from "next/navigation";
import { signIn, signOut, type Role } from "./auth";

export async function login(role: Role, formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  const ok = await signIn(role, password);
  redirect(ok ? `/${role}` : `/${role}/login?error=1`);
}

export async function logout(role: Role): Promise<void> {
  await signOut(role);
  redirect("/");
}
