import type { Avpu, News2Breakdown, ReferenceRange, TriageLevel, VitalsSchedule, VitalsSet } from "../types";

export type VitalSeverity = "normal" | "abnormal" | "critical" | "missing";

export const DEFAULT_REFERENCE_RANGES: ReferenceRange[] = [
  range("temperature", "Temp", "C", 30, 45, 36, 37.9, 35, 39.1),
  range("heartRate", "HR", "bpm", 20, 300, 60, 100, 40, 130),
  range("respiratoryRate", "RR", "/min", 4, 70, 12, 20, 8, 30),
  range("systolicBp", "SBP", "mmHg", 40, 300, 100, 140, 90, 220),
  range("diastolicBp", "DBP", "mmHg", 20, 180, 60, 90, 40, 120),
  range("spo2", "SpO2", "%", 50, 100, 95, 100, 90, null),
  range("painScore", "Pain", "/10", 0, 10, 0, 3, null, 8),
  range("bloodGlucose", "Glucose", "mg/dL", 20, 900, 70, 180, 50, 400),
  range("weightKg", "Weight", "kg", 0.5, 400, 40, 140, null, null),
  range("heightCm", "Height", "cm", 20, 250, 120, 210, null, null),
];

export const DEFAULT_VITALS_SCHEDULES: VitalsSchedule[] = [
  { id: "esi-1", context: "esi", level: "1", intervalMinutes: null, label: "monitor" },
  { id: "esi-2", context: "esi", level: "2", intervalMinutes: 15, label: "every 15 min" },
  { id: "esi-3", context: "esi", level: "3", intervalMinutes: 60, label: "every 60 min" },
  { id: "esi-4", context: "esi", level: "4", intervalMinutes: 120, label: "every 120 min" },
  { id: "esi-5", context: "esi", level: "5", intervalMinutes: 120, label: "every 120 min" },
  { id: "start-red", context: "start", level: "red", intervalMinutes: 15, label: "every 15 min" },
  { id: "start-yellow", context: "start", level: "yellow", intervalMinutes: 60, label: "every 60 min" },
  { id: "start-green", context: "start", level: "green", intervalMinutes: null, label: "none required" },
];

function range(
  parameter: string,
  label: string,
  unit: string,
  plausibleMin: number,
  plausibleMax: number,
  normalMin: number | null,
  normalMax: number | null,
  criticalLow: number | null,
  criticalHigh: number | null,
): ReferenceRange {
  return { id: `range-${parameter}`, parameter, label, unit, plausibleMin, plausibleMax, normalMin, normalMax, criticalLow, criticalHigh };
}

export function calculateBmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm) return null;
  const meters = heightCm / 100;
  if (meters <= 0) return null;
  return Number((weightKg / (meters * meters)).toFixed(1));
}

export function scoreNews2(input: {
  respiratoryRate: number | null;
  spo2: number | null;
  supplementalO2: boolean;
  temperature: number | null;
  systolicBp: number | null;
  heartRate: number | null;
  consciousness: Avpu;
}): { score: number; breakdown: News2Breakdown } {
  const breakdown: News2Breakdown = {
    respiratoryRate: scoreResp(input.respiratoryRate),
    spo2: scoreSpo2Scale1(input.spo2),
    supplementalO2: input.supplementalO2 ? 2 : 0,
    temperature: scoreTemp(input.temperature),
    systolicBp: scoreSbp(input.systolicBp),
    heartRate: scoreHr(input.heartRate),
    consciousness: input.consciousness === "Alert" ? 0 : 3,
  };
  return {
    score: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
    breakdown,
  };
}

function scoreResp(value: number | null) {
  if (value === null) return 0;
  if (value <= 8) return 3;
  if (value <= 11) return 1;
  if (value <= 20) return 0;
  if (value <= 24) return 2;
  return 3;
}

function scoreSpo2Scale1(value: number | null) {
  if (value === null) return 0;
  if (value <= 91) return 3;
  if (value <= 93) return 2;
  if (value <= 95) return 1;
  return 0;
}

function scoreTemp(value: number | null) {
  if (value === null) return 0;
  if (value <= 35) return 3;
  if (value <= 36) return 1;
  if (value <= 38) return 0;
  if (value <= 39) return 1;
  return 2;
}

function scoreSbp(value: number | null) {
  if (value === null) return 0;
  if (value <= 90) return 3;
  if (value <= 100) return 2;
  if (value <= 110) return 1;
  if (value <= 219) return 0;
  return 3;
}

function scoreHr(value: number | null) {
  if (value === null) return 0;
  if (value <= 40) return 3;
  if (value <= 50) return 1;
  if (value <= 90) return 0;
  if (value <= 110) return 1;
  if (value <= 130) return 2;
  return 3;
}

export function severityFor(
  parameter: string,
  value: number | null,
  ranges: ReferenceRange[] = DEFAULT_REFERENCE_RANGES,
): VitalSeverity {
  if (value === null || Number.isNaN(value)) return "missing";
  const range = ranges.find((candidate) => candidate.parameter === parameter);
  if (!range) return "normal";
  if ((range.criticalLow !== null && value < range.criticalLow) || (range.criticalHigh !== null && value > range.criticalHigh)) return "critical";
  if ((range.normalMin !== null && value < range.normalMin) || (range.normalMax !== null && value > range.normalMax)) return "abnormal";
  return "normal";
}

export function implausibleFields(values: Partial<Record<string, number | null>>, ranges: ReferenceRange[] = DEFAULT_REFERENCE_RANGES): string[] {
  return Object.entries(values)
    .filter(([, value]) => value !== null && value !== undefined)
    .filter(([key, value]) => {
      const range = ranges.find((candidate) => candidate.parameter === key);
      return Boolean(range && (value! < range.plausibleMin || value! > range.plausibleMax));
    })
    .map(([key]) => key);
}

export function latestVitals(sets: VitalsSet[]): VitalsSet | null {
  return [...sets].sort((a, b) => b.recordedAt - a.recordedAt)[0] ?? null;
}

export function previousVitals(sets: VitalsSet[]): VitalsSet | null {
  return [...sets].sort((a, b) => b.recordedAt - a.recordedAt)[1] ?? null;
}

export function intervalForTriage(triage: TriageLevel | null, schedules: VitalsSchedule[] = DEFAULT_VITALS_SCHEDULES): VitalsSchedule | null {
  if (triage === null) return null;
  const context = typeof triage === "number" ? "esi" : "start";
  return schedules.find((schedule) => schedule.context === context && schedule.level === String(triage)) ?? null;
}

export function vitalsDueAt(latestRecordedAt: number | null, triage: TriageLevel | null, schedules?: VitalsSchedule[]): number | null {
  const interval = intervalForTriage(triage, schedules);
  if (!interval || interval.intervalMinutes === null) return null;
  return (latestRecordedAt ?? 0) + interval.intervalMinutes * 60 * 1000;
}

export function isVitalsOverdue(latestRecordedAt: number | null, triage: TriageLevel | null, now = Date.now(), schedules?: VitalsSchedule[]): boolean {
  const dueAt = vitalsDueAt(latestRecordedAt, triage, schedules);
  return dueAt !== null && dueAt <= now;
}

export function advisoryTextForVitals(vitals: VitalsSet): string | null {
  const hasSingleThree = Object.values(vitals.news2Breakdown).some((value) => value === 3);
  if (vitals.news2 >= 7) return `NEWS2 ${vitals.news2}: emergency assessment recommended`;
  if (vitals.news2 >= 5 || hasSingleThree) return `NEWS2 ${vitals.news2}: consider urgent review and re-triage`;
  return null;
}

export function esiHintForVitals(vitals: VitalsSet | null): string | null {
  if (!vitals) return null;
  const critical = [
    ["RR", severityFor("respiratoryRate", vitals.respiratoryRate)],
    ["SpO2", severityFor("spo2", vitals.spo2)],
    ["SBP", severityFor("systolicBp", vitals.systolicBp)],
    ["AVPU", vitals.consciousness === "Alert" ? "normal" : "critical"],
  ].some(([, severity]) => severity === "critical");
  if (critical || vitals.news2 >= 5) return "Vitals suggest considering ESI 2";
  if (vitals.news2 >= 3) return "Vitals suggest considering ESI 3";
  return null;
}

export function formatAgo(timestamp: number, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours}h ${rem}m ago` : `${hours}h ago`;
}
