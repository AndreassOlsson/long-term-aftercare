import Link from "next/link";
import { logout } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { PATIENTS } from "@/lib/patients";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireRole("doctor");
  return (
    <div className="flex min-h-screen flex-1">
      <aside className="flex w-56 shrink-0 flex-col gap-4 border-r border-zinc-300 p-5">
        <h2 className="text-sm font-medium text-zinc-500">Patients</h2>
        <nav className="flex flex-col gap-1">
          {PATIENTS.map((p) => (
            <Link key={p.id} href={`/doctor/patients/${p.id}`} className="rounded px-2 py-1 hover:bg-zinc-100">
              {p.name}
            </Link>
          ))}
        </nav>
        <form action={logout.bind(null, "doctor")} className="mt-auto">
          <button className="text-sm underline">Log out</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
