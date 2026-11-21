import { ApplyTextSize } from "@/components/patient/text-size";
import { Nav } from "@/components/patient/nav";
import { requireRole } from "@/lib/auth";
import { listRequests } from "@/lib/requests";
import { PATIENTS } from "@/lib/patients";

// The patient's shell: every screen but the login sits inside it.
export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  await requireRole("patient");
  const requests = await listRequests(PATIENTS[0].id);
  const answered = requests
    .filter((r) => r.status === "answered" && r.reply)
    .map((r) => ({ id: r.id, updatedAt: r.updatedAt }));
  return (
    <div className="flex flex-1 flex-col text-[1.0625rem] leading-relaxed">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pb-28 pt-5">{children}</div>
      <ApplyTextSize />
      <Nav answered={answered} />
    </div>
  );
}
