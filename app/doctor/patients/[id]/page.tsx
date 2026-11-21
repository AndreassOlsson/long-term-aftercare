import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { requireRole } from "@/lib/auth";
import { getPatient } from "@/lib/patients";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("doctor");
  const patient = getPatient((await params).id);
  if (!patient) notFound();
  return (
    <Shell role="doctor" heading={patient.name}>
      <Link href="/doctor" className="text-sm underline">
        All patients
      </Link>
      <p className="text-zinc-600">
        Placeholder. The clinician&apos;s view of the timeline goes here.
      </p>
    </Shell>
  );
}
