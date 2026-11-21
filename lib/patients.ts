// The proof of concept has exactly one mock patient.
export type Patient = { id: string; name: string };

export const PATIENTS: Patient[] = [{ id: "maria", name: "Maria Andersson" }];

export const getPatient = (id: string) => PATIENTS.find((p) => p.id === id);
