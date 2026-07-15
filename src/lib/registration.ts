import type { Patient } from "../types";

export interface PatientMatch {
  patient: Patient;
  score: number;
  reasons: string[];
  strong: boolean;
}

export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function lastDigits(value: string | null | undefined, count = 6): string {
  return (value ?? "").replace(/\D/g, "").slice(-count);
}

export function birthYear(value: string | null | undefined): string | null {
  return value?.match(/^(\d{4})/)?.[1] ?? null;
}

export function fuzzyPatientMatches(
  patients: Patient[],
  query: { text?: string; phone?: string; nationalId?: string; dob?: string },
): PatientMatch[] {
  const text = normalizeSearch(query.text ?? "");
  const queryTokens = text.split(" ").filter(Boolean);
  const queryPhone = lastDigits(query.phone);
  const queryYear = birthYear(query.dob);
  const queryNationalId = normalizeSearch(query.nationalId ?? "");
  const tags = text.match(/#?b-\d+/i)?.[0]?.replace(/^#?/, "#") ?? null;

  if (!text && !queryPhone && !queryNationalId && !queryYear) return [];

  return patients
    .filter((patient) => !patient.mergedIntoPatientId || patient.mergeUndoneAt)
    .map((patient) => {
      const reasons: string[] = [];
      let score = 0;

      const patientName = normalizeSearch(patient.name ?? "");
      const patientTokens = patientName.split(" ").filter(Boolean);
      const tokenDistances = queryTokens.map((token) =>
        Math.min(...patientTokens.map((candidate) => levenshtein(token, candidate)), 99),
      );
      const matchedName = queryTokens.length > 0 && tokenDistances.every((distance) => distance <= 2);
      const closeName = queryTokens.length > 0 && tokenDistances.every((distance) => distance <= 1);
      if (matchedName) {
        score += closeName ? 55 : 36;
        reasons.push(closeName ? "close name" : "similar name");
      }

      if (queryNationalId && normalizeSearch(patient.nationalId ?? "") === queryNationalId) {
        score += 80;
        reasons.push("national ID");
      }

      const patientPhone = lastDigits(patient.phone);
      if (queryPhone && patientPhone && queryPhone === patientPhone) {
        score += 34;
        reasons.push("phone");
      }

      const patientYear = birthYear(patient.dateOfBirth);
      const sameYear = Boolean(queryYear && patientYear && queryYear === patientYear);
      if (sameYear) {
        score += 18;
        reasons.push("birth year");
      } else if (query.dob && patient.dateOfBirth === query.dob) {
        score += 22;
        reasons.push("date of birth");
      }

      if (text && (patient.mrn?.toLowerCase().includes(text) || patient.displayNumber.toLowerCase().includes(text))) {
        score += 45;
        reasons.push("identifier");
      }

      if (tags && patient.catastropheTags?.includes(tags)) {
        score += 90;
        reasons.push("catastrophe tag");
      }

      return {
        patient,
        score,
        reasons,
        strong: Boolean(closeName && sameYear),
      };
    })
    .filter((match) => match.score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], prev, row[j]) + 1;
      row[j - 1] = prev;
      prev = old;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}
