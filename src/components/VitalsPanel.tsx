import { useMemo, useState } from "react";
import { Activity, ChevronDown, HeartPulse, Save } from "lucide-react";
import { deleteVitalsSet, recordVitalsSet, type VitalsInput } from "../db/repo";
import { useAppStore } from "../store/useAppStore";
import {
  DEFAULT_REFERENCE_RANGES,
  advisoryTextForVitals,
  esiHintForVitals,
  formatAgo,
  intervalForTriage,
  isVitalsOverdue,
  latestVitals,
  previousVitals,
  severityFor,
} from "../lib/vitals";
import type { Avpu, TriageLevel, VitalsSet } from "../types";

const inputClass = "w-full rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm outline-none";

const FULL_FIELDS: FieldSpec[] = [
  { key: "temperature", label: "Temp", unit: "C", placeholder: "36-37.9", step: "0.1" },
  { key: "heartRate", label: "HR", unit: "bpm", placeholder: "60-100" },
  { key: "respiratoryRate", label: "RR", unit: "/min", placeholder: "12-20" },
  { key: "systolicBp", label: "SBP", unit: "mmHg", placeholder: "100-140" },
  { key: "diastolicBp", label: "DBP", unit: "mmHg", placeholder: "60-90" },
  { key: "spo2", label: "SpO2", unit: "%", placeholder: "95-100" },
  { key: "painScore", label: "Pain", unit: "/10", placeholder: "0-3" },
  { key: "bloodGlucose", label: "Glucose", unit: "mg/dL", placeholder: "70-180" },
  { key: "weightKg", label: "Weight", unit: "kg", placeholder: "40-140", step: "0.1" },
  { key: "heightCm", label: "Height", unit: "cm", placeholder: "120-210", step: "0.1" },
];

const CRISIS_FIELDS: FieldSpec[] = [
  { key: "heartRate", label: "HR", unit: "bpm", placeholder: "60-100" },
  { key: "respiratoryRate", label: "RR", unit: "/min", placeholder: "12-20" },
  { key: "spo2", label: "SpO2", unit: "%", placeholder: "95-100" },
  { key: "systolicBp", label: "SBP", unit: "mmHg", placeholder: "100-140" },
];

type NumericKey = Exclude<keyof VitalsInput, "supplementalO2" | "consciousness" | "source">;

interface FieldSpec {
  key: NumericKey;
  label: string;
  unit: string;
  placeholder: string;
  step?: string;
}

export function VitalsCaptureForm({
  encounterId,
  source = "full",
  compact = false,
  onSaved,
}: {
  encounterId: string;
  source?: VitalsInput["source"];
  compact?: boolean;
  onSaved?: (vitals: VitalsSet) => void;
}) {
  const mode = useAppStore((s) => s.mode);
  const pushToast = useAppStore((s) => s.pushToast);
  const [values, setValues] = useState<Record<NumericKey, string>>({
    temperature: "",
    heartRate: "",
    respiratoryRate: "",
    systolicBp: "",
    diastolicBp: "",
    spo2: "",
    painScore: "",
    bloodGlucose: "",
    weightKg: "",
    heightCm: "",
    gcsEye: "",
    gcsVerbal: "",
    gcsMotor: "",
  });
  const [supplementalO2, setSupplementalO2] = useState(false);
  const [consciousness, setConsciousness] = useState<Avpu>("Alert");
  const [showGcs, setShowGcs] = useState(false);
  const [touchedImplausible, setTouchedImplausible] = useState<string[]>([]);
  const fields = compact ? CRISIS_FIELDS : FULL_FIELDS;
  const parsed = parseValues(values);
  const bmi = parsed.weightKg && parsed.heightCm ? (parsed.weightKg / ((parsed.heightCm / 100) ** 2)).toFixed(1) : "-";

  function setField(key: NumericKey, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function checkPlausibility(key: NumericKey) {
    const value = parseNumber(values[key]);
    const range = DEFAULT_REFERENCE_RANGES.find((candidate) => candidate.parameter === key);
    if (value !== null && range && (value < range.plausibleMin || value > range.plausibleMax)) {
      setTouchedImplausible((current) => current.includes(key) ? current : [...current, key]);
    }
  }

  async function save() {
    const vitals = await recordVitalsSet(encounterId, {
      ...parsed,
      supplementalO2,
      consciousness,
      source,
    }, mode);
    setValues((current) => Object.fromEntries(Object.keys(current).map((key) => [key, ""])) as Record<NumericKey, string>);
    setSupplementalO2(false);
    setConsciousness("Alert");
    setTouchedImplausible([]);
    onSaved?.(vitals);
    pushToast("Vitals saved", () => void deleteVitalsSet(vitals.id, mode));
  }

  return (
    <section className={compact ? "space-y-3" : "card space-y-3"}>
      {!compact && (
        <div className="flex items-center gap-2">
          <HeartPulse size={17} className="text-[var(--color-primary)]" />
          <h2 className="text-sm font-semibold">Record vitals</h2>
        </div>
      )}
      <div className={compact ? "grid grid-cols-2 gap-3" : "grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2"}>
        {fields.map((field) => {
          const value = parseNumber(values[field.key]);
          const severity = severityFor(String(field.key), value);
          return (
            <label key={String(field.key)} className="block">
              <span className="mb-1 flex items-center justify-between text-xs font-bold uppercase text-[var(--color-ink-secondary)]">
                {field.label}
                <span className="font-semibold normal-case">{field.unit}</span>
              </span>
              <input
                type="number"
                inputMode="decimal"
                step={field.step ?? "1"}
                value={values[field.key]}
                onChange={(event) => setField(field.key, event.target.value)}
                onBlur={() => checkPlausibility(field.key)}
                placeholder={field.placeholder}
                className={`${inputClass} ${severityClass(severity)} ${compact ? "min-h-14 text-xl font-semibold" : ""}`}
              />
              {touchedImplausible.includes(field.key) && (
                <span className="mt-0.5 block text-xs font-semibold text-[var(--color-red-solid)]">check this value</span>
              )}
            </label>
          );
        })}
      </div>

      {!compact && (
        <>
          <div className="grid grid-cols-[1fr_170px_1fr] gap-2 max-[760px]:grid-cols-1">
            <label className="flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2.5 py-2 text-sm font-semibold">
              <input type="checkbox" checked={supplementalO2} onChange={(event) => setSupplementalO2(event.target.checked)} />
              Supplemental O2
            </label>
            <label>
              <span className="mb-1 block text-xs font-bold uppercase text-[var(--color-ink-secondary)]">AVPU</span>
              <select value={consciousness} onChange={(event) => setConsciousness(event.target.value as Avpu)} className={inputClass}>
                <option>Alert</option>
                <option>Voice</option>
                <option>Pain</option>
                <option>Unresponsive</option>
              </select>
            </label>
            <div className="rounded-md bg-[var(--color-surface-muted)] px-3 py-2 text-sm">
              <span className="text-xs font-bold uppercase text-[var(--color-ink-secondary)]">BMI</span>
              <span className="ml-2 font-semibold">{bmi}</span>
            </div>
          </div>
          <button type="button" onClick={() => setShowGcs((value) => !value)} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)]">
            <ChevronDown size={14} /> GCS
          </button>
          {showGcs && (
            <div className="grid grid-cols-3 gap-2">
              {[
                ["gcsEye", "Eye 1-4"],
                ["gcsVerbal", "Verbal 1-5"],
                ["gcsMotor", "Motor 1-6"],
              ].map(([key, label]) => (
                <label key={key}>
                  <span className="mb-1 block text-xs font-bold uppercase text-[var(--color-ink-secondary)]">{label}</span>
                  <input type="number" className={inputClass} value={values[key as NumericKey]} onChange={(event) => setField(key as NumericKey, event.target.value)} />
                </label>
              ))}
            </div>
          )}
        </>
      )}

      {compact && (
        <label>
          <span className="mb-1 block text-xs font-bold uppercase text-[var(--color-ink-secondary)]">AVPU</span>
          <select value={consciousness} onChange={(event) => setConsciousness(event.target.value as Avpu)} className={`${inputClass} min-h-14 text-lg font-semibold`}>
            <option>Alert</option>
            <option>Voice</option>
            <option>Pain</option>
            <option>Unresponsive</option>
          </select>
        </label>
      )}

      <button type="button" onClick={() => void save()} className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white">
        <Save size={15} /> Save vitals
      </button>
    </section>
  );
}

export function VitalsHeader({ sets, triage }: { sets: VitalsSet[]; triage: TriageLevel | null }) {
  const latest = latestVitals(sets);
  const previous = previousVitals(sets);
  const stale = isVitalsOverdue(latest?.recordedAt ?? null, triage);
  const schedule = intervalForTriage(triage);
  if (!latest) {
    return <div className="card text-sm text-[var(--color-ink-secondary)]">No structured vitals recorded yet.</div>;
  }
  const tiles = [
    tile("HR", latest.heartRate, previous?.heartRate, "heartRate", "bpm"),
    tile("BP", latest.systolicBp, previous?.systolicBp, "systolicBp", latest.diastolicBp ? `/${latest.diastolicBp}` : "mmHg"),
    tile("SpO2", latest.spo2, previous?.spo2, "spo2", "%"),
    tile("RR", latest.respiratoryRate, previous?.respiratoryRate, "respiratoryRate", "/min"),
    tile("Temp", latest.temperature, previous?.temperature, "temperature", "C"),
    tile("NEWS2", latest.news2, previous?.news2 ?? null, "news2", ""),
  ];
  return (
    <section className={`card ${stale ? "opacity-70" : ""}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold">Latest vitals</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${latest.news2 >= 7 ? "bg-[var(--color-red-tint)] text-[var(--color-red-text)]" : latest.news2 >= 5 ? "bg-[var(--color-yellow-tint)] text-[var(--color-yellow-text)]" : "bg-[var(--color-surface-muted)] text-[var(--color-ink-secondary)]"}`}>
          NEWS2 {latest.news2}
        </span>
        <span className="text-xs text-[var(--color-ink-secondary)]">{formatAgo(latest.recordedAt)}{stale ? " | vitals due" : schedule ? ` | ${schedule.label}` : ""}</span>
      </div>
      <div className="grid grid-cols-6 gap-2 max-[860px]:grid-cols-3 max-[520px]:grid-cols-2">
        {tiles.map((item) => (
          <div key={item.label} className={`rounded-md border border-[var(--color-border)] px-2 py-1.5 ${severityClass(item.severity)}`}>
            <div className="text-xs font-bold uppercase text-[var(--color-ink-secondary)]">{item.label}</div>
            <div className="text-lg font-semibold">{item.value} <span className="text-xs">{item.unit}</span> <span className="text-xs">{item.arrow}</span></div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function News2Banner({ latest, onRetriage }: { latest: VitalsSet | null; onRetriage: () => void }) {
  if (!latest) return null;
  const text = advisoryTextForVitals(latest);
  if (!text) return null;
  const red = latest.news2 >= 7;
  return (
    <div className={`rounded-md border px-3 py-2 ${red ? "border-[var(--color-red-solid)] bg-[var(--color-red-tint)] text-[var(--color-red-text)]" : "border-[var(--color-yellow-solid)] bg-[var(--color-yellow-tint)] text-[var(--color-yellow-text)]"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm">Advisory</strong>
        <span className="text-sm">{text}</span>
        <button onClick={onRetriage} className="ml-auto rounded-md bg-white/70 px-2 py-1 text-xs font-semibold">Open re-triage</button>
      </div>
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer font-semibold">Score breakdown</summary>
        <div className="mt-1 flex flex-wrap gap-1">
          {Object.entries(latest.news2Breakdown).map(([key, value]) => (
            <span key={key} className="rounded bg-white/60 px-1.5 py-0.5">{key}: {value}</span>
          ))}
        </div>
      </details>
    </div>
  );
}

export function VitalsFlowsheet({ sets }: { sets: VitalsSet[] }) {
  const ordered = [...sets].sort((a, b) => a.recordedAt - b.recordedAt);
  if (!ordered.length) return <div className="card text-sm text-[var(--color-ink-secondary)]">No vitals history yet.</div>;
  const parameters = [
    ["heartRate", "HR"], ["systolicBp", "SBP"], ["diastolicBp", "DBP"], ["spo2", "SpO2"], ["respiratoryRate", "RR"], ["temperature", "Temp"], ["painScore", "Pain"], ["news2", "NEWS2"],
  ] as const;
  return (
    <div className="space-y-3">
      <section className="card">
        <h2 className="mb-2 text-sm font-semibold">Trends</h2>
        <div className="grid grid-cols-3 gap-3 max-[760px]:grid-cols-1">
          {parameters.filter(([key]) => ["heartRate", "systolicBp", "spo2", "temperature", "respiratoryRate", "news2"].includes(key)).map(([key, label]) => (
            <Sparkline key={key} label={label} values={ordered.map((set) => Number((set as unknown as Record<string, number | null>)[key] ?? 0))} />
          ))}
        </div>
      </section>
      <section className="card overflow-x-auto">
        <h2 className="mb-2 text-sm font-semibold">Flowsheet</h2>
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left">Parameter</th>
              {ordered.map((set) => <th key={set.id} className="px-2 py-1 text-right">{new Date(set.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</th>)}
            </tr>
          </thead>
          <tbody>
            {parameters.map(([key, label]) => (
              <tr key={key} className="border-t border-[var(--color-border)]">
                <td className="px-2 py-1 font-semibold">{label}</td>
                {ordered.map((set) => {
                  const value = (set as unknown as Record<string, number | null>)[key];
                  const severity = key === "news2" ? (Number(value) >= 7 ? "critical" : Number(value) >= 5 ? "abnormal" : "normal") : severityFor(key, value);
                  return <td key={set.id} className={`px-2 py-1 text-right ${severityClass(severity)}`}>{value ?? "-"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function TriageVitalsAdvisory({ latest }: { latest: VitalsSet | null }) {
  const hint = esiHintForVitals(latest);
  if (!hint) return null;
  return (
    <div className="rounded-md bg-[var(--color-yellow-tint)] px-2.5 py-2 text-sm font-semibold text-[var(--color-yellow-text)]">
      Advisory: {hint}{latest ? ` (NEWS2 ${latest.news2})` : ""}
    </div>
  );
}

export function CrisisNewsChip({ latest }: { latest: VitalsSet | null }) {
  if (!latest) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${latest.news2 >= 7 ? "bg-[var(--color-red-tint)] text-[var(--color-red-text)]" : latest.news2 >= 5 ? "bg-[var(--color-yellow-tint)] text-[var(--color-yellow-text)]" : "bg-[var(--color-surface-muted)] text-[var(--color-ink-secondary)]"}`}>
      <Activity size={13} /> NEWS2 {latest.news2}
    </span>
  );
}

function Sparkline({ label, values }: { label: string; values: number[] }) {
  const [expanded, setExpanded] = useState(false);
  const points = useMemo(() => {
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = Math.max(1, max - min);
    return values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * 100},${32 - ((value - min) / span) * 28}`).join(" ");
  }, [values]);
  return (
    <button type="button" onClick={() => setExpanded((value) => !value)} className="rounded-md border border-[var(--color-border)] p-2 text-left">
      <div className="mb-1 text-xs font-bold uppercase text-[var(--color-ink-secondary)]">{label}</div>
      <svg viewBox="0 0 100 36" className="h-12 w-full">
        <polyline fill="none" stroke="var(--color-primary)" strokeWidth="2.5" points={points} />
        {expanded && values.map((value, index) => <circle key={`${value}-${index}`} cx={(index / Math.max(1, values.length - 1)) * 100} cy={Number(points.split(" ")[index]?.split(",")[1] ?? 18)} r="2.2" fill="var(--color-red-solid)" />)}
      </svg>
      {expanded && <div className="text-xs text-[var(--color-ink-secondary)]">{values.join(" | ")}</div>}
    </button>
  );
}

function parseValues(values: Record<NumericKey, string>): Record<NumericKey, number | null> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, parseNumber(value)])) as Record<NumericKey, number | null>;
}

function parseNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function tile(label: string, value: number | null, prev: number | null | undefined, parameter: string, unit: string) {
  const arrow = value === null || prev === null || prev === undefined ? "" : value > prev ? "up" : value < prev ? "down" : "flat";
  return { label, value: value ?? "-", unit, arrow, severity: parameter === "news2" ? (Number(value) >= 7 ? "critical" : Number(value) >= 5 ? "abnormal" : "normal") : severityFor(parameter, value) };
}

function severityClass(severity: string) {
  if (severity === "critical") return "bg-[var(--color-red-tint)] text-[var(--color-red-text)]";
  if (severity === "abnormal") return "bg-[var(--color-yellow-tint)] text-[var(--color-yellow-text)]";
  return "bg-[var(--color-surface)]";
}
