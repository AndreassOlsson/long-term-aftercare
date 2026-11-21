"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Patient } from "@/lib/patients";

export function PatientNav({ patients }: { patients: Patient[] }) {
  const path = usePathname();
  return (
    <nav className="mt-2 flex flex-col gap-1">
      {patients.map((p) => {
        const href = `/doctor/patients/${p.id}`;
        const current = path === href;
        return (
          <Link
            key={p.id}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`rounded-lg px-3 py-2.5 font-semibold ${
              current ? "bg-paper text-ink" : "text-paper hover:bg-ink-soft"
            }`}
          >
            {p.name}
          </Link>
        );
      })}
    </nav>
  );
}
