import { ApplyTextSize } from "@/components/patient/text-size";
import { requireRole } from "@/lib/auth";

// The patient's shell: every screen but the login sits inside it. The sections
// (app/patient/(app)/page.tsx) bring their own bar; a focused task has none.
export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  await requireRole("patient");
  return (
    <div className="flex flex-1 flex-col text-[1.0625rem] leading-relaxed">
      {children}
      <ApplyTextSize />
    </div>
  );
}
