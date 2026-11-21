import { logout } from "@/lib/actions";
import { requireRole } from "@/lib/auth";
import { PATIENTS } from "@/lib/patients";
import { PatientNav } from "@/components/patient-nav";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireRole("doctor");
  return (
    <div className="flex min-h-screen flex-1">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col bg-ink px-4 py-6 text-paper">
        <p className="px-3 text-lg font-bold">Long-term aftercare</p>
        <h2 className="mt-8 px-3 text-[15px] text-[#a9b6c0]">Your patients</h2>
        <PatientNav patients={PATIENTS} />
        <form action={logout.bind(null, "doctor")} className="mt-auto px-3">
          <button className="text-[#a9b6c0] underline-offset-4 hover:text-paper hover:underline">Log out</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 px-10 py-9">{children}</main>
    </div>
  );
}
