import { notFound } from "next/navigation";
import { DoctorPatient } from "@/components/doctor-patient";
import { requireRole } from "@/lib/auth";
import { getEntries, latestSummary } from "@/lib/entries";
import { getPatient } from "@/lib/patients";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("doctor");
  const patient = getPatient((await params).id);
  if (!patient) notFound();
  const entries = await getEntries(patient.id);
  return <DoctorPatient name={patient.name} entries={entries} summary={latestSummary(entries)} />;
}
