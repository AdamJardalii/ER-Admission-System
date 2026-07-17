import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Activity, ChartLine, ChevronDown, Check, CopyPlus, HeartPulse, Save } from "lucide-react";
import { deleteVitalsSet, recordVitalsSet, type VitalsInput } from "../db/repo";
import { useAppStore } from "../store/useAppStore";
import { DropdownSelect } from "./FloatingDropdown";
import {
  DEFAULT_REFERENCE_RANGES,
  advisoryTextForVitals,
  bandFor,
  dedupeFlowsheetColumns,
  esiHintForVitals,
  formatAgo,
  intervalForTriage,
  isVitalsOverdue,
  latestVitals,
  news2RiskBand,
  previousVitals,
  scoreNews2,
  severityFor,
  type VitalBand,
} from "../lib/vitals";
import type { Avpu, TriageLevel, VitalsSet } from "../types";

const inputClass = "min-h-10 w-full rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm outline-none";

const AVPU_OPTIONS: Avpu[] = ["Alert", "Voice", "Pain", "Unresponsive"];

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

type NumericKey = Exclude<keyof VitalsInput, "supplementalO2" | "consciousness" | "source" | "gcsTotal">;

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
              <DropdownSelect
                value={consciousness}
                options={AVPU_OPTIONS}
                onChange={(value) => setConsciousness(value as Avpu)}
                className={inputClass}
                ariaLabel="AVPU"
              />
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
          <DropdownSelect
            value={consciousness}
            options={AVPU_OPTIONS}
            onChange={(value) => setConsciousness(value as Avpu)}
            className={`${inputClass} min-h-14 text-lg font-semibold`}
            ariaLabel="AVPU"
          />
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

// Eight NEWS2-relevant vitals shown as tiles in the console. Each drives a large
// numeric input, a live band color, a normal-range hint and a per-vital sparkline.
const CONSOLE_TILES: ConsoleTileSpec[] = [
  { key: "temperature", label: "Temp", unit: "C", hint: "36.1-38", step: "0.1" },
  { key: "heartRate", label: "Heart rate", unit: "bpm", hint: "51-90" },
  { key: "respiratoryRate", label: "Resp rate", unit: "/min", hint: "12-20" },
  { key: "spo2", label: "SpO2", unit: "%", hint: "96-100" },
  { key: "systolicBp", label: "Systolic BP", unit: "mmHg", hint: "111-219" },
  { key: "diastolicBp", label: "Diastolic BP", unit: "mmHg", hint: "60-90" },
  { key: "painScore", label: "Pain", unit: "/10", hint: "0-3" },
  { key: "bloodGlucose", label: "Glucose", unit: "mg/dL", hint: "70-180" },
];

interface ConsoleTileSpec {
  key: ConsoleKey;
  label: string;
  unit: string;
  hint: string;
  step?: string;
}

type ConsoleKey =
  | "temperature"
  | "heartRate"
  | "respiratoryRate"
  | "spo2"
  | "systolicBp"
  | "diastolicBp"
  | "painScore"
  | "bloodGlucose";

type VitalGraphKey = ConsoleKey | "news2";

const VITAL_GRAPH_PARAMETERS: { key: VitalGraphKey; label: string; unit: string }[] = [
  { key: "heartRate", label: "Heart rate", unit: "bpm" },
  { key: "systolicBp", label: "Systolic BP", unit: "mmHg" },
  { key: "diastolicBp", label: "Diastolic BP", unit: "mmHg" },
  { key: "spo2", label: "SpO2", unit: "%" },
  { key: "respiratoryRate", label: "Respiratory rate", unit: "/min" },
  { key: "temperature", label: "Temperature", unit: "C" },
  { key: "painScore", label: "Pain score", unit: "/10" },
  { key: "bloodGlucose", label: "Blood glucose", unit: "mg/dL" },
  { key: "news2", label: "NEWS2", unit: "" },
];

const AVPU_SEGMENTS: { value: Avpu; short: string }[] = [
  { value: "Alert", short: "A" },
  { value: "Voice", short: "V" },
  { value: "Pain", short: "P" },
  { value: "Unresponsive", short: "U" },
];

// Consolidated vitals view: replaces the old summary card + input row + trends.
// Tile grid, live validation, live NEWS2, secondary controls, and a compact
// flowsheet — all in roughly one viewport. On the Vitals tab this is the single
// source for current values and NEWS2, so the chart header hides its read-only
// vitals strip and advisory banner and defers to the chip + advisory strip here.
export function VitalsConsole({ encounterId, sets, onRetriage }: { encounterId: string; sets: VitalsSet[]; onRetriage?: () => void }) {
  const mode = useAppStore((s) => s.mode);
  const pushToast = useAppStore((s) => s.pushToast);
  const latest = latestVitals(sets);
  const [values, setValues] = useState<Record<ConsoleKey, string>>(emptyConsoleValues);
  const [supplementalO2, setSupplementalO2] = useState(false);
  const [consciousness, setConsciousness] = useState<Avpu>("Alert");
  const [gcs, setGcs] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [historyView, setHistoryView] = useState<"graph" | "flowsheet">("graph");
  const [graphKey, setGraphKey] = useState<VitalGraphKey>("heartRate");
  const hydratedSnapshotRef = useRef<ConsoleSnapshot | null>(null);

  // "Saved" confirmation auto-dismisses; clear the timer on unmount / re-save.
  useEffect(() => {
    if (!justSaved) return;
    const timer = window.setTimeout(() => setJustSaved(false), 2500);
    return () => window.clearTimeout(timer);
  }, [justSaved]);

  useEffect(() => {
    if (!latest) return;
    const next = consoleSnapshotFromVitals(latest);
    const previous = hydratedSnapshotRef.current;
    const current: ConsoleSnapshot = { id: previous?.id ?? null, values, supplementalO2, consciousness, gcs };
    const untouched = previous ? sameConsoleSnapshot(current, previous) : !hasConsoleInput(values, supplementalO2, consciousness, gcs);
    if (!untouched || previous?.id === latest.id) return;
    hydratedSnapshotRef.current = next;
    setValues(next.values);
    setSupplementalO2(next.supplementalO2);
    setConsciousness(next.consciousness);
    setGcs(next.gcs);
  }, [latest, values, supplementalO2, consciousness, gcs]);

  const parsed = useMemo(() => {
    const out = {} as Record<ConsoleKey, number | null>;
    for (const key of Object.keys(values) as ConsoleKey[]) out[key] = parseNumber(values[key]);
    return out;
  }, [values]);

  const news = useMemo(
    () => scoreNews2({
      respiratoryRate: parsed.respiratoryRate,
      spo2: parsed.spo2,
      supplementalO2,
      temperature: parsed.temperature,
      systolicBp: parsed.systolicBp,
      heartRate: parsed.heartRate,
      consciousness,
    }),
    [parsed, supplementalO2, consciousness],
  );
  const anyEntered = (Object.keys(values) as ConsoleKey[]).some((key) => values[key].trim() !== "")
    || supplementalO2 || consciousness !== "Alert" || gcs.trim() !== "";
  const risk = news2RiskBand(news.score, news.breakdown);
  // Live advisory follows the same escalation rule as saved sets, but scores from
  // what is currently typed so it tracks the header chip.
  const hasSingleThree = Object.values(news.breakdown).some((value) => value >= 3);
  const advisory = anyEntered
    ? news.score >= 7
      ? `NEWS2 ${news.score}: emergency assessment recommended`
      : news.score >= 5 || hasSingleThree
        ? `NEWS2 ${news.score}: consider urgent review and re-triage`
        : null
    : null;

  function setField(key: ConsoleKey, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function prefillFromLast() {
    if (!latest) return;
    const next = consoleSnapshotFromVitals(latest);
    hydratedSnapshotRef.current = next;
    setValues(next.values);
    setSupplementalO2(next.supplementalO2);
    setConsciousness(next.consciousness);
    setGcs(next.gcs);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const vitals = await recordVitalsSet(encounterId, {
        ...parsed,
        supplementalO2,
        consciousness,
        gcsTotal: parseNumber(gcs),
        source: "full",
      }, mode);
      // Keep the values in the inputs after saving so the nurse can continue.
      setJustSaved(true);
      pushToast("Vitals saved", () => void deleteVitalsSet(vitals.id, mode));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--color-border)] pb-2">
        <div className="mr-auto flex min-w-0 items-center gap-2">
          <HeartPulse size={17} className="shrink-0 text-[var(--color-primary)]" />
          <h2 className="text-base font-semibold">Vitals</h2>
          <span className="truncate text-xs text-[var(--color-ink-secondary)]">
            {latest ? `Last recorded ${new Date(latest.recordedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · ${formatAgo(latest.recordedAt)}` : "No measurements yet"}
          </span>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-bold ${news2ChipClass(risk)}`}
          title="Live NEWS2 — updates as you type"
          aria-live="polite"
        >
          <Activity size={14} /> NEWS2 {news.score}
          <span className="text-xs font-semibold uppercase opacity-80">{risk}</span>
        </span>
        <a href="#vitals-history" className="inline-flex min-h-9 shrink-0 items-center px-2 text-sm font-semibold text-[var(--color-primary)]">History</a>
      </div>

      {advisory && (
        <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2.5 py-1.5 text-sm ${risk === "high" ? "bg-[var(--color-red-tint)] text-[var(--color-red-text)]" : "bg-[var(--color-yellow-tint)] text-[var(--color-yellow-text)]"}`}>
          <span className="min-w-0 flex-1 font-medium">{advisory}</span>
          {onRetriage && (
            <button type="button" onClick={onRetriage} className="shrink-0 rounded border border-current/30 bg-[var(--color-surface)] px-2 py-0.5 text-xs font-semibold text-[var(--color-ink)]">
              Open re-triage
            </button>
          )}
          <button
            type="button"
            aria-expanded={breakdownOpen}
            onClick={() => setBreakdownOpen((open) => !open)}
            className="shrink-0 text-xs font-semibold underline"
          >
            {breakdownOpen ? "Hide breakdown" : "Score breakdown"}
          </button>
          {breakdownOpen && (
            <div className="flex w-full flex-wrap gap-1 pt-1">
              {Object.entries(news.breakdown).map(([key, value]) => (
                <span key={key} className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-xs text-[var(--color-ink-secondary)]">{news2BreakdownLabel(key)}: {value}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="vitals-tile-grid">
        {CONSOLE_TILES.map((tile) => (
          <VitalTile
            key={tile.key}
            spec={tile}
            value={values[tile.key]}
            band={bandFor(tile.key, parsed[tile.key])}
            onChange={(value) => setField(tile.key, value)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-[var(--color-border)] pt-3">
        <div>
          <span className="mb-1 block text-xs font-bold uppercase text-[var(--color-ink-secondary)]">AVPU</span>
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)]" role="group" aria-label="AVPU consciousness">
            {AVPU_SEGMENTS.map((segment) => (
              <button
                key={segment.value}
                type="button"
                aria-pressed={consciousness === segment.value}
                title={segment.value}
                onClick={() => setConsciousness(segment.value)}
                className={`min-h-9 w-9 border-l border-[var(--color-border)] text-sm font-bold first:border-l-0 ${
                  consciousness === segment.value ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-surface)] text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)]"
                }`}
              >
                {segment.short}
              </button>
            ))}
          </div>
        </div>
        <label className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--color-border)] px-2.5 text-sm font-semibold">
          <input type="checkbox" checked={supplementalO2} onChange={(event) => setSupplementalO2(event.target.checked)} />
          Supplemental O2
        </label>
        <label className="w-[104px]">
          <span className="mb-1 block text-xs font-bold uppercase text-[var(--color-ink-secondary)]">GCS</span>
          <span className="relative block">
            <input
              type="number"
              inputMode="numeric"
              min={3}
              max={15}
              value={gcs}
              onChange={(event) => setGcs(event.target.value)}
              placeholder="15"
              className="min-h-9 w-full rounded-md border border-[var(--color-border)] px-2.5 py-1.5 pr-9 text-sm tabular-nums outline-none focus:border-[var(--color-primary)]"
            />
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs font-semibold text-[var(--color-ink-secondary)]">/15</span>
          </span>
        </label>
        <button
          type="button"
          onClick={prefillFromLast}
          disabled={!latest}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 text-sm font-semibold text-[var(--color-primary)] disabled:opacity-40"
        >
          <CopyPlus size={15} /> Prefill from last
        </button>
        <div className="ml-auto flex items-center gap-2">
          {justSaved && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-green-text)]" role="status">
              <Check size={15} /> Saved
            </span>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !anyEntered}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Save size={15} /> {saving ? "Saving…" : "Save vitals"}
          </button>
        </div>
      </div>

      <div id="vitals-history">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="mr-auto inline-flex overflow-hidden rounded-md border border-[var(--color-border)]">
            <button
              type="button"
              aria-pressed={historyView === "graph"}
              onClick={() => setHistoryView("graph")}
              className={`inline-flex min-h-9 items-center gap-1 border-r border-[var(--color-border)] px-2.5 text-sm font-semibold ${historyView === "graph" ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-surface)] text-[var(--color-ink-secondary)]"}`}
            >
              <ChartLine size={15} /> Graph
            </button>
            <button
              type="button"
              aria-pressed={historyView === "flowsheet"}
              onClick={() => setHistoryView("flowsheet")}
              className={`min-h-9 px-2.5 text-sm font-semibold ${historyView === "flowsheet" ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-surface)] text-[var(--color-ink-secondary)]"}`}
            >
              Flowsheet
            </button>
          </div>
          {historyView === "graph" && (
            <DropdownSelect
              value={graphKey}
              options={VITAL_GRAPH_PARAMETERS.map((parameter) => ({ value: parameter.key, label: parameter.label }))}
              onChange={(value) => setGraphKey(value as VitalGraphKey)}
              className="min-h-9 min-w-[190px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm"
              ariaLabel="Vital sign graph parameter"
            />
          )}
        </div>
        {historyView === "graph" ? <VitalsTrendGraph sets={sets} parameterKey={graphKey} /> : <VitalsFlowsheet sets={sets} />}
      </div>
    </section>
  );
}

// Compact entry tile: label + status dot, numeric input + unit, quiet range hint.
// Intentionally holds only what entry needs — history lives in the flowsheet.
function VitalTile({
  spec,
  value,
  band,
  onChange,
}: {
  spec: ConsoleTileSpec;
  value: string;
  band: VitalBand;
  onChange: (value: string) => void;
}) {
  return (
    <div className={`rounded-md border px-2.5 py-1.5 transition-colors ${tileBandClass(band)}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-[var(--color-ink-secondary)]">{spec.label}</span>
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotBandClass(band)}`} aria-hidden="true" />
      </div>
      <div className="flex items-baseline gap-1">
        <input
          type="number"
          inputMode="decimal"
          step={spec.step ?? "1"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${spec.label} (${spec.unit})`}
          className="vitals-tile-input min-h-9 w-full min-w-0 appearance-none border-0 bg-transparent p-0 text-[19px] font-semibold leading-tight tabular-nums text-[var(--color-ink)] outline-none"
        />
        <span className="shrink-0 text-xs font-semibold text-[var(--color-ink-secondary)]">{spec.unit}</span>
      </div>
      <span className="block truncate text-[11px] text-[var(--color-ink-secondary)]">Normal {spec.hint}</span>
    </div>
  );
}

const emptyConsoleValues: Record<ConsoleKey, string> = {
  temperature: "",
  heartRate: "",
  respiratoryRate: "",
  spo2: "",
  systolicBp: "",
  diastolicBp: "",
  painScore: "",
  bloodGlucose: "",
};

interface ConsoleSnapshot {
  id: string | null;
  values: Record<ConsoleKey, string>;
  supplementalO2: boolean;
  consciousness: Avpu;
  gcs: string;
}

function consoleSnapshotFromVitals(vitals: VitalsSet): ConsoleSnapshot {
  return {
    id: vitals.id,
    values: {
      temperature: numToInput(vitals.temperature),
      heartRate: numToInput(vitals.heartRate),
      respiratoryRate: numToInput(vitals.respiratoryRate),
      spo2: numToInput(vitals.spo2),
      systolicBp: numToInput(vitals.systolicBp),
      diastolicBp: numToInput(vitals.diastolicBp),
      painScore: numToInput(vitals.painScore),
      bloodGlucose: numToInput(vitals.bloodGlucose),
    },
    supplementalO2: vitals.supplementalO2,
    consciousness: vitals.consciousness,
    gcs: numToInput(vitals.gcsTotal),
  };
}

function hasConsoleInput(values: Record<ConsoleKey, string>, supplementalO2: boolean, consciousness: Avpu, gcs: string) {
  return Object.values(values).some((value) => value.trim() !== "") || supplementalO2 || consciousness !== "Alert" || gcs.trim() !== "";
}

function sameConsoleSnapshot(a: ConsoleSnapshot, b: ConsoleSnapshot) {
  return a.supplementalO2 === b.supplementalO2
    && a.consciousness === b.consciousness
    && a.gcs === b.gcs
    && (Object.keys(a.values) as ConsoleKey[]).every((key) => a.values[key] === b.values[key]);
}

function numToInput(value: number | null): string {
  return value === null ? "" : String(value);
}

function tileBandClass(band: VitalBand) {
  if (band === "red") return "border-[var(--color-red-solid)] bg-[var(--color-red-tint)]";
  if (band === "amber") return "border-[var(--color-yellow-solid)] bg-[var(--color-yellow-tint)]";
  return "border-[var(--color-border)] bg-[var(--color-surface)]";
}

function dotBandClass(band: VitalBand) {
  if (band === "red") return "bg-[var(--color-red-solid)]";
  if (band === "amber") return "bg-[var(--color-yellow-solid)]";
  if (band === "normal") return "bg-[var(--color-green-solid)]";
  return "border border-[var(--color-border-strong)] bg-transparent";
}

function news2ChipClass(risk: "low" | "medium" | "high") {
  if (risk === "high") return "bg-[var(--color-red-tint)] text-[var(--color-red-text)]";
  if (risk === "medium") return "bg-[var(--color-yellow-tint)] text-[var(--color-yellow-text)]";
  return "bg-[var(--color-green-tint)] text-[var(--color-green-text)]";
}

const NEWS2_BREAKDOWN_LABELS: Record<string, string> = {
  respiratoryRate: "RR",
  spo2: "SpO2",
  supplementalO2: "O2",
  temperature: "Temp",
  systolicBp: "SBP",
  heartRate: "HR",
  consciousness: "AVPU",
};

function news2BreakdownLabel(key: string) {
  return NEWS2_BREAKDOWN_LABELS[key] ?? key;
}

function VitalsTrendGraph({ sets, parameterKey }: { sets: VitalsSet[]; parameterKey: VitalGraphKey }) {
  const parameter = VITAL_GRAPH_PARAMETERS.find((item) => item.key === parameterKey) ?? VITAL_GRAPH_PARAMETERS[0];
  const points = useMemo(
    () =>
      [...sets]
        .sort((a, b) => a.recordedAt - b.recordedAt)
        .map((set) => ({ set, value: valueForGraph(set, parameterKey) }))
        .filter((point): point is { set: VitalsSet; value: number } => point.value !== null),
    [sets, parameterKey],
  );

  if (!points.length) {
    return (
      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3">
        <h3 className="text-sm font-semibold">Vitals graph</h3>
        <p className="mt-1 text-sm text-[var(--color-ink-secondary)]">No saved {parameter.label.toLowerCase()} readings yet.</p>
      </section>
    );
  }

  const width = 720;
  const height = 220;
  const pad = { top: 18, right: 18, bottom: 34, left: 42 };
  const values = points.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = Math.max(1, rawMax - rawMin);
  const min = Math.max(0, Math.floor(rawMin - spread * 0.15));
  const max = Math.ceil(rawMax + spread * 0.15);
  const xFor = (index: number) => pad.left + (points.length === 1 ? (width - pad.left - pad.right) / 2 : (index / (points.length - 1)) * (width - pad.left - pad.right));
  const yFor = (value: number) => pad.top + ((max - value) / Math.max(1, max - min)) * (height - pad.top - pad.bottom);
  const polyline = points.map((point, index) => `${xFor(index)},${yFor(point.value)}`).join(" ");
  const latest = points[points.length - 1];

  return (
    <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{parameter.label} trend</h3>
        <span className="rounded bg-[var(--color-primary-tint)] px-2 py-1 text-xs font-bold text-[var(--color-primary)]">
          Latest {latest.value}{parameter.unit ? ` ${parameter.unit}` : ""} at {new Date(latest.set.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[620px] rounded bg-[var(--color-surface-muted)]" role="img" aria-label={`${parameter.label} trend graph`}>
          <line x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} stroke="var(--color-border-strong)" />
          <line x1={pad.left} y1={height - pad.bottom} x2={width - pad.right} y2={height - pad.bottom} stroke="var(--color-border-strong)" />
          {[min, Math.round((min + max) / 2), max].map((tick) => {
            const y = yFor(tick);
            return (
              <g key={tick}>
                <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="var(--color-border)" strokeDasharray="4 4" />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--color-ink-secondary)">{tick}</text>
              </g>
            );
          })}
          <polyline fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={polyline} />
          {points.map((point, index) => {
            const x = xFor(index);
            const y = yFor(point.value);
            const severity = parameterKey === "news2"
              ? point.value >= 7 ? "critical" : point.value >= 5 ? "abnormal" : "normal"
              : severityFor(parameterKey, point.value);
            return (
              <g key={`${point.set.id}-${parameterKey}`}>
                <circle cx={x} cy={y} r={5} fill={graphPointColor(severity)} stroke="var(--color-surface)" strokeWidth="2" />
                <title>{`${new Date(point.set.recordedAt).toLocaleString()}: ${point.value}${parameter.unit ? ` ${parameter.unit}` : ""}`}</title>
              </g>
            );
          })}
          {points.map((point, index) => {
            if (index !== 0 && index !== points.length - 1 && points.length > 4) return null;
            return (
              <text key={`${point.set.id}-label`} x={xFor(index)} y={height - 12} textAnchor="middle" fontSize="11" fill="var(--color-ink-secondary)">
                {new Date(point.set.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </text>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

function valueForGraph(set: VitalsSet, key: VitalGraphKey): number | null {
  if (key === "news2") return set.news2;
  return set[key];
}

function graphPointColor(severity: string) {
  if (severity === "critical") return "var(--color-red-solid)";
  if (severity === "abnormal") return "var(--color-yellow-solid)";
  return "var(--color-primary)";
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

// Compact flowsheet: parameters as rows, timestamps as columns, latest column
// highlighted, abnormal cells tinted. Trend charts were removed — the tile
// sparklines cover trend-at-a-glance, and full charts live behind Vitals history.
export function VitalsFlowsheet({ sets }: { sets: VitalsSet[] }) {
  const parameters = [
    ["heartRate", "HR"], ["systolicBp", "SBP"], ["diastolicBp", "DBP"], ["spo2", "SpO2"], ["respiratoryRate", "RR"], ["temperature", "Temp"], ["painScore", "Pain"], ["news2", "NEWS2"],
  ] as const;
  // One column per distinct recorded minute. Two sets saved in the same minute
  // would otherwise render as identical timestamp columns; collapse them, keeping
  // the most recent set's values, and tag only the final column "now".
  const columns = useMemo(() => dedupeFlowsheetColumns(sets), [sets]);
  const latestKey = columns[columns.length - 1]?.key;
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">Flowsheet</h3>
      {!columns.length ? (
        <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-ink-secondary)]">
          No readings yet — the first saved set will appear here as a column.
        </p>
      ) : (
        <>
          <div className="vitals-flowsheet-scroll max-[720px]:hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="vitals-flowsheet-param sticky left-0 z-10 whitespace-nowrap bg-[var(--color-surface)] px-2 py-1 text-left font-semibold text-[var(--color-ink-secondary)]">Parameter</th>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`whitespace-nowrap px-2 py-1 text-right font-semibold ${col.key === latestKey ? "bg-[var(--color-primary-tint)] text-[var(--color-primary)]" : "text-[var(--color-ink-secondary)]"}`}
                    >
                      {col.label}
                      {col.key === latestKey && <span className="ml-1 text-[10px] uppercase">now</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parameters.map(([key, label]) => (
                  <tr key={key} className="border-t border-[var(--color-border)]">
                    <td className="vitals-flowsheet-param sticky left-0 z-10 whitespace-nowrap bg-[var(--color-surface)] px-2 py-1 font-semibold">{label}</td>
                    {columns.map((col) => {
                      const value = (col.set as unknown as Record<string, number | null>)[key];
                      const severity = key === "news2" ? (Number(value) >= 7 ? "critical" : Number(value) >= 5 ? "abnormal" : "normal") : severityFor(key, value);
                      const isLatest = col.key === latestKey;
                      const tint = severityClass(severity);
                      return (
                        <td
                          key={col.key}
                          className={`whitespace-nowrap px-2 py-1 text-right tabular-nums ${value === null ? "text-[var(--color-ink-secondary)]" : ""} ${tint} ${isLatest && severity === "normal" ? "bg-[var(--color-primary-tint)]" : ""} ${isLatest ? "font-semibold" : ""}`}
                        >
                          {value ?? "–"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hidden space-y-2 max-[720px]:block">
            {[...columns].reverse().map(({ key, set }) => (
              <article key={key} className={`rounded-md border p-3 ${key === latestKey ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"}`}>
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
        </>
      )}
    </section>
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
