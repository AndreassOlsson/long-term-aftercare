import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { isSignedIn } from "@/lib/auth";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isSignedIn("patient")) redirect("/patient");
  const { error } = await searchParams;
  return <LoginForm role="patient" title="Your diary" failed={Boolean(error)} />;
}
