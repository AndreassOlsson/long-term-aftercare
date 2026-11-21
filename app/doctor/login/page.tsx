import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { isSignedIn, passwordRequired } from "@/lib/auth";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isSignedIn("doctor")) redirect("/doctor");
  const { error } = await searchParams;
  if (!passwordRequired() && !error) redirect("/doctor/login/enter");
  return <LoginForm role="doctor" title="Clinician login" failed={Boolean(error)} />;
}
