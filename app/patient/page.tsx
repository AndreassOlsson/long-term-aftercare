import { Shell } from "@/components/shell";
import { requireRole } from "@/lib/auth";
import { PATIENTS } from "@/lib/patients";

export default async function Page() {
  await requireRole("patient");
  return (
    <Shell role="patient" heading={PATIENTS[0].name}>
      <p className="text-zinc-600">
        Placeholder. The timeline and the form for adding an entry go here.
      </p>
    </Shell>
  );
}
