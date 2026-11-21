import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { isSignedIn, passwordRequired } from "@/lib/auth";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isSignedIn("patient")) redirect("/patient");
  const { error } = await searchParams;
  if (!passwordRequired() && !error) redirect("/patient/login/enter");
  return <LoginForm role="patient" title="Patient login" failed={Boolean(error)} />;
}
