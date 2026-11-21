import { PatientHome } from "@/components/patient-home";
import { requireRole } from "@/lib/auth";
import { today } from "@/lib/dates";
import { getEntries } from "@/lib/entries";
import { storageNotice } from "@/lib/notice";
import { PATIENTS } from "@/lib/patients";

// The agents run inside this page's actions and can take a while.
export const maxDuration = 300;

export default async function Page() {
  await requireRole("patient");
  const patient = PATIENTS[0];
  return (
    <PatientHome
      firstName={patient.name.split(" ")[0]}
      initialEntries={await getEntries(patient.id)}
      today={today()}
      notice={storageNotice()}
    />
  );
}
