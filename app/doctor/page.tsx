import Link from "next/link";
import { Shell } from "@/components/shell";
import { requireRole } from "@/lib/auth";
import { PATIENTS } from "@/lib/patients";

export default async function Page() {
  await requireRole("doctor");
  return (
    <Shell role="doctor" heading="Patients">
      <ul className="flex flex-col gap-2">
        {PATIENTS.map((p) => (
          <li key={p.id}>
            <Link
              href={`/doctor/patients/${p.id}`}
              className="block rounded border border-zinc-300 p-4 hover:bg-zinc-50"
            >
              {p.name}
            </Link>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
