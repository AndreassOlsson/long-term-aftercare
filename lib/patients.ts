// Maria Andersson is the one patient with a record. The others are
// placeholders for the clinician's inbox, so it reads like a clinic and not
// like a one-person demo: they have a case ID and a one-line status, and no
// record behind them. Maria stays first; the patient's side relies on that.
export type Patient = {
  id: string;
  name: string;
  /** True for the stand-ins that have no record in this proof of concept. */
  placeholder?: boolean;
  /** The clinic's case ID, shown for placeholders. */
  caseId?: string;
  /** What the stand-in's line in the inbox says. Only for placeholders. */
  note?: string;
};

export const PATIENTS: Patient[] = [
  { id: "maria", name: "Maria Andersson" },
  {
    id: "case-4471",
    name: "Case 4471",
    placeholder: true,
    caseId: "A-4471",
    note: "Placeholder: stable at the last check-up, next one in the spring.",
  },
  {
    id: "case-4519",
    name: "Case 4519",
    placeholder: true,
    caseId: "A-4519",
    note: "Placeholder: new socket fitted three weeks ago, no check-ins yet.",
  },
  {
    id: "case-4602",
    name: "Case 4602",
    placeholder: true,
    caseId: "A-4602",
    note: "Placeholder: asked about liner replacement last month, handled.",
  },
];

export const getPatient = (id: string) => PATIENTS.find((p) => p.id === id);
