import type { Encounter, Patient, TriageLevel } from "../types";

export function patientPin(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return String(Math.abs(hash) % 1000000).padStart(6, "0");
}

export function patientQrPayload({
  patient,
  encounter,
  triage,
}: {
  patient: Patient;
  encounter: Encounter;
  triage: TriageLevel | null;
}): string {
  return JSON.stringify({
    type: "er-patient",
    displayNumber: patient.displayNumber,
    mrn: patient.mrn,
    encounterId: encounter.id,
    caseNumber: encounter.caseNumber,
    pin: patientPin(`${patient.displayNumber}:${encounter.id}`),
    name: patient.name,
    triage,
    location: encounter.currentLocationName,
  });
}
