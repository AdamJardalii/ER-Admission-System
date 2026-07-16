import { useId, useMemo, useState } from "react";
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

const inputClass = "min-h-10 w-full rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm outline-none";

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
  embedded = false,
  formId,
  showSaveButton = true,
  onSaved,
}: {
  encounterId: string;
  source?: VitalsInput["source"];
  compact?: boolean;
  embedded?: boolean;
  formId?: string;
  showSaveButton?: boolean;
  onSaved?: (vitals: VitalsSet) => void;
}) {
  const generatedFormId = useId();
  const resolvedFormId = formId ?? generatedFormId;
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
  const gcsParts = [parsed.gcsEye, parsed.gcsVerbal, parsed.gcsMotor];
  const gcsTotal = gcsParts.every((part) => part !== null) ? gcsParts.reduce<number>((total, part) => total + (part ?? 0), 0) : null;

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
    <form
      id={resolvedFormId}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className={compact ? "space-y-3" : embedded ? "space-y-2" : "card space-y-3"}
    >
      {!compact && !embedded && (
        <div className="flex items-center gap-2">
          <HeartPulse size={17} className="text-[var(--color-primary)]" />
          <h2 className="text-sm font-semibold">Record vitals</h2>
        </div>
      )}
      <div className={compact ? "grid grid-cols-2 gap-3" : "vitals-entry-grid"}>
        {fields.map((field) => {
          const value = parseNumber(values[field.key]);
          const severity = severityFor(String(field.key), value);
          const warningId = `${resolvedFormId}-${String(field.key)}-warning`;
          const showWarning = touchedImplausible.includes(field.key);
          return (
            <label key={String(field.key)} className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-[var(--color-ink-secondary)]">{field.label}</span>
              <span className="relative block">
                <input
                  type="number"
                  inputMode="decimal"
                  step={field.step ?? "1"}
                  value={values[field.key]}
                  onChange={(event) => setField(field.key, event.target.value)}
                  onBlur={() => checkPlausibility(field.key)}
                  placeholder={field.placeholder}
                  aria-invalid={showWarning}
                  aria-describedby={showWarning ? warningId : undefined}
                  className={`${inputClass} pr-14 tabular-nums ${severityClass(severity)} ${compact ? "min-h-14 text-xl font-semibold" : ""}`}
                />
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs font-semibold text-[var(--color-ink-secondary)]">{field.unit}</span>
              </span>
              {showWarning && (
                <span id={warningId} className="mt-0.5 block text-xs font-semibold text-[var(--color-red-solid)]">Check this value</span>
              )}
            </label>
          );
        })}
      </div>

      {!compact && (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--color-border)] px-2.5 text-sm font-semibold">
              <input type="checkbox" checked={supplementalO2} onChange={(event) => setSupplementalO2(event.target.checked)} />
              Supplemental O2
            </label>
            <label className="w-[150px] max-[440px]:flex-1">
              <span className="mb-1 block text-xs font-bold uppercase text-[var(--color-ink-secondary)]">AVPU</span>
              <select value={consciousness} onChange={(event) => setConsciousness(event.target.value as Avpu)} className={inputClass}>
                <option>Alert</option>
                <option>Voice</option>
                <option>Pain</option>
                <option>Unresponsive</option>
              </select>
            </label>
            <button
              type="button"
              aria-expanded={showGcs}
              onClick={() => setShowGcs((value) => !value)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 text-sm font-semibold text-[var(--color-primary)]"
            >
              <ChevronDown size={14} className={`transition-transform ${showGcs ? "rotate-180" : ""}`} />
              GCS <span className="tabular-nums text-[var(--color-ink)]">{gcsTotal ?? "-"}</span>
            </button>
            <div className="inline-flex min-h-10 items-center rounded-md bg-[var(--color-surface-muted)] px-2.5 text-sm">
              <span className="text-xs font-bold uppercase text-[var(--color-ink-secondary)]">BMI</span>
              <span className="ml-2 font-semibold tabular-nums">{bmi} {bmi !== "-" && <span className="text-xs font-medium text-[var(--color-ink-secondary)]">kg/m2</span>}</span>
            </div>
            {showSaveButton && (
              <button type="submit" className="ml-auto inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white">
                <Save size={15} /> Save vitals
              </button>
            )}
          </div>
          {showGcs && (
            <div className="grid grid-cols-3 gap-2 max-[560px]:grid-cols-1">
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

      {compact && showSaveButton && (
        <button type="submit" className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white">
          <Save size={15} /> Save vitals
        </button>
      )}
    </form>
  );
}

export function VitalsHeader({ sets, triage, location }: { sets: VitalsSet[]; triage: TriageLevel | null; location?: string | null }) {
  const latest = latestVitals(sets);
  const previous = previousVitals(sets);
  const stale = isVitalsOverdue(latest?.recordedAt ?? null, triage);
  const schedule = intervalForTriage(triage);

  if (!latest) {
    return (
      <div className="flex min-w-[220px] flex-1 flex-wrap items-center gap-2 text-sm text-[var(--color-ink-secondary)] max-[720px]:order-5 max-[720px]:min-w-0 max-[720px]:w-full">
        {location !== undefined && <RoomChip location={location} />}
        <span>Vitals not recorded</span>
      </div>
    );
  }

  const tiles = [
    tile("HR", latest.heartRate, previous?.heartRate, "heartRate", "bpm"),
    tile("BP", latest.systolicBp, previous?.systolicBp, "systolicBp", latest.diastolicBp ? `/${latest.diastolicBp}` : "mmHg"),
    tile("SpO2", latest.spo2, previous?.spo2, "spo2", "%"),
    tile("RR", latest.respiratoryRate, previous?.respiratoryRate, "respiratoryRate", "/min"),
    tile("Temp", latest.temperature, previous?.temperature, "temperature", "C"),
    tile("Pain", latest.painScore, previous?.painScore ?? null, "painScore", "/10"),
    tile("NEWS2", latest.news2, previous?.news2 ?? null, "news2", ""),
  ];

  return (
    <div
      className={`flex min-w-[320px] flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm max-[720px]:order-5 max-[720px]:min-w-0 max-[720px]:w-full ${
        stale ? "rounded-md border border-[var(--color-red-solid)] bg-[var(--color-red-tint)] px-2 py-1" : ""
      }`}
    >
      {location !== undefined && <RoomChip location={location} />}
      {tiles.map((item, index) => (
        <span
          key={item.label}
          className={`inline-flex shrink-0 items-baseline gap-1 whitespace-nowrap ${index > 0 ? "border-l border-[var(--color-border)] pl-2" : ""} ${headerSeverityClass(item.severity)}`}
          title={item.label}
        >
          <span className="text-xs font-bold uppercase text-[var(--color-ink-secondary)]">{item.label}</span>
          <span className="font-semibold tabular-nums">{item.value}</span>
          {item.unit && <span className="text-xs text-[var(--color-ink-secondary)]">{item.unit}</span>}
          {item.arrow && <span className="text-xs font-semibold">{item.arrow === "up" ? "+" : item.arrow === "down" ? "-" : ""}</span>}
        </span>
      ))}
      <span className={`shrink-0 whitespace-nowrap text-xs ${stale ? "font-semibold text-[var(--color-red-text)]" : "text-[var(--color-ink-secondary)]"}`}>
        {formatAgo(latest.recordedAt)}{stale ? " - vitals due" : schedule ? ` - ${schedule.label}` : ""}
      </span>
    </div>
  );
}

export function CurrentVitalsSummary({ sets, recording, onRecord }: { sets: VitalsSet[]; recording: boolean; onRecord: () => void }) {
  const current = latestVitals(sets);
  const values = [
    { label: "BP", value: current ? `${current.systolicBp ?? "-"}/${current.diastolicBp ?? "-"}` : "-/-", unit: "mmHg", severity: severityFor("systolicBp", current?.systolicBp ?? null) },
    { label: "Heart rate", value: current?.heartRate ?? "-", unit: "bpm", severity: severityFor("heartRate", current?.heartRate ?? null) },
    { label: "Respiratory rate", value: current?.respiratoryRate ?? "-", unit: "/min", severity: severityFor("respiratoryRate", current?.respiratoryRate ?? null) },
    { label: "SpO2", value: current?.spo2 ?? "-", unit: "%", severity: severityFor("spo2", current?.spo2 ?? null) },
    { label: "Temperature", value: current?.temperature ?? "-", unit: "C", severity: severityFor("temperature", current?.temperature ?? null) },
    { label: "Weight", value: current?.weightKg ?? "-", unit: "kg", severity: "normal" },
    { label: "Height", value: current?.heightCm ?? "-", unit: "cm", severity: "normal" },
    { label: "BMI", value: current?.bmi ?? "-", unit: "kg/m2", severity: "normal" },
    { label: "Pain", value: current?.painScore ?? "-", unit: "/10", severity: severityFor("painScore", current?.painScore ?? null) },
  ];

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] pb-2">
        <div className="mr-auto">
          <h2 className="text-base font-semibold">Vitals and biometrics</h2>
          <p className="text-xs text-[var(--color-ink-secondary)]">
            {current
              ? `Recorded ${new Date(current.recordedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · ${formatAgo(current.recordedAt)}`
              : "No measurements recorded"}
          </p>
        </div>
        <a href="#vitals-history" className="inline-flex min-h-10 items-center px-2 text-sm font-semibold text-[var(--color-primary)]">Vitals history</a>
        <button type="button" onClick={onRecord} aria-expanded={recording} className="inline-flex min-h-10 items-center rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white">
          {recording ? "Close form" : "Record vitals"}
        </button>
      </div>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(118px,1fr))] gap-px overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-border)]">
        {values.map((item) => (
          <div key={item.label} className={`min-w-0 px-3 py-2 ${summarySeverityClass(item.severity)}`}>
            <dt className="text-xs font-semibold text-[var(--color-ink-secondary)]">{item.label}</dt>
            <dd className="mt-0.5 whitespace-nowrap text-base font-semibold tabular-nums">
              {item.value} <span className="text-xs font-medium text-[var(--color-ink-secondary)]">{item.unit}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RoomChip({ location }: { location: string | null }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-sm font-bold ${
        location ? "bg-[var(--color-primary-tint)] text-[var(--color-primary)]" : "bg-[var(--color-yellow-tint)] text-[var(--color-yellow-text)]"
      }`}
    >
      {location ?? "Unassigned"}
    </span>
  );
}

export function News2Banner({ latest, onRetriage }: { latest: VitalsSet | null; onRetriage: () => void }) {
  if (!latest) return null;
  const text = advisoryTextForVitals(latest);
  if (!text) return null;
  const red = latest.news2 >= 7;
  return (
    <div className={`mt-2 rounded-md border px-3 py-2 ${red ? "border-[var(--color-red-solid)] bg-[var(--color-red-tint)] text-[var(--color-red-text)]" : "border-[var(--color-yellow-solid)] bg-[var(--color-yellow-tint)] text-[var(--color-yellow-text)]"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm">Advisory</strong>
        <span className="min-w-[220px] flex-1 text-sm">{text}</span>
        <button onClick={onRetriage} className="ml-auto min-h-9 shrink-0 rounded-md bg-[var(--color-surface)] px-3 text-sm font-semibold">Open re-triage</button>
      </div>
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer font-semibold">Score breakdown</summary>
        <div className="mt-1 flex flex-wrap gap-1">
          {Object.entries(latest.news2Breakdown).map(([key, value]) => (
            <span key={key} className="rounded bg-[var(--color-surface)] px-1.5 py-0.5">{key}: {value}</span>
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
        <div className="grid grid-cols-3 gap-3 max-[720px]:grid-cols-1">
          {parameters.filter(([key]) => ["heartRate", "systolicBp", "spo2", "temperature", "respiratoryRate", "news2"].includes(key)).map(([key, label]) => (
            <Sparkline key={key} label={label} values={ordered.map((set) => Number((set as unknown as Record<string, number | null>)[key] ?? 0))} />
          ))}
        </div>
      </section>
      <section className="card">
        <h2 className="mb-2 text-sm font-semibold">Flowsheet</h2>
        <div className="overflow-x-auto max-[720px]:hidden">
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
        </div>
        <div className="hidden space-y-2 max-[720px]:block">
          {[...ordered].reverse().map((set) => (
            <article key={set.id} className="rounded-md border border-[var(--color-border)] p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                <time className="font-semibold">{new Date(set.recordedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
                <span className={`rounded px-2 py-0.5 text-xs font-bold ${severityClass(set.news2 >= 7 ? "critical" : set.news2 >= 5 ? "abnormal" : "normal")}`}>NEWS2 {set.news2}</span>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <MobileVital label="BP" value={`${set.systolicBp ?? "-"}/${set.diastolicBp ?? "-"}`} />
                <MobileVital label="HR" value={set.heartRate} />
                <MobileVital label="SpO2" value={set.spo2} suffix="%" />
                <MobileVital label="RR" value={set.respiratoryRate} />
                <MobileVital label="Temp" value={set.temperature} suffix=" C" />
                <MobileVital label="Pain" value={set.painScore} suffix="/10" />
              </dl>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function MobileVital({ label, value, suffix = "" }: { label: string; value: string | number | null; suffix?: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-[var(--color-ink-secondary)]">{label}</dt>
      <dd className="font-semibold tabular-nums">{value ?? "-"}{value !== null && value !== "-" ? suffix : ""}</dd>
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

function headerSeverityClass(severity: string) {
  if (severity === "critical") return "rounded bg-[var(--color-red-tint)] px-1.5 text-[var(--color-red-text)]";
  if (severity === "abnormal") return "rounded bg-[var(--color-yellow-tint)] px-1.5 text-[var(--color-yellow-text)]";
  return "";
}

function summarySeverityClass(severity: string) {
  if (severity === "critical") return "bg-[var(--color-red-tint)] text-[var(--color-red-text)]";
  if (severity === "abnormal") return "bg-[var(--color-yellow-tint)] text-[var(--color-yellow-text)]";
  return "bg-[var(--color-surface)]";
}
