import { useState } from "react";
import { Plus, ShieldAlert, X } from "lucide-react";
import { useAllergyRecords } from "../../../db/hooks";
import { addAllergyRecord, removeAllergyRecord, updateAllergyRecord } from "../../../db/repo";
import { useAppStore } from "../../../store/useAppStore";
import { ALLERGY_OPTIONS } from "../../../lib/clinicalCatalog";
import { StatusPill, SuggestionInput, type Tone } from "../../../components/DomainTab";
import type { AllergySeverity, Encounter, Mode } from "../../../types";

const severityTone: Record<AllergySeverity, Tone> = { mild: "yellow", moderate: "yellow", severe: "red" };

// Safety-critical allergies stay readable in the patient header. Mutation
// controls open deliberately so the status strip does not become a form row.
export function AllergiesBanner({ encounterId, encounter }: { encounterId: string; encounter: Encounter }) {
  const mode = useAppStore((s) => s.mode) as Mode;
  const records = useAllergyRecords(encounterId);
  const [adding, setAdding] = useState(false);
  const [substance, setSubstance] = useState("");
  const [severity, setSeverity] = useState<AllergySeverity>("moderate");

  const structured = new Set(records.map((record) => record.substance));
  const legacy = encounter.allergies.filter((allergy) => !structured.has(allergy));
  const active = records.filter((record) => record.status === "active");
  const hasAny = active.length > 0 || legacy.length > 0;

  async function add() {
    const value = substance.trim();
    if (!value) return;
    await addAllergyRecord(
      {
        encounterId,
        patientId: encounter.patientId,
        substance: value,
        reaction: null,
        severity,
        status: "active",
        actor: encounter.currentProvider ?? null,
      },
      mode,
    );
    setSubstance("");
    setSeverity("moderate");
    setAdding(false);
  }

  return (
    <div
      className={`relative flex min-w-[240px] flex-wrap items-center gap-1.5 rounded-md border px-2 py-1 max-[720px]:order-2 max-[720px]:w-full ${
        hasAny
          ? "border-[var(--color-red-solid)] bg-[var(--color-red-tint)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)]"
      }`}
    >
      <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-bold uppercase ${hasAny ? "text-[var(--color-red-text)]" : "text-[var(--color-ink-secondary)]"}`}>
        <ShieldAlert size={14} /> Allergies
      </span>

      {!hasAny && <span className="text-sm text-[var(--color-ink-secondary)]">None known</span>}

      {active.map((record) => (
        <span key={record.id} className="inline-flex min-h-7 max-w-full items-center gap-1 rounded bg-[var(--color-surface)] px-1.5 text-sm font-semibold text-[var(--color-red-text)]">
          <span className="break-words">{record.substance}</span>
          {record.reaction && <span className="break-words font-normal text-[var(--color-ink-secondary)]">- {record.reaction}</span>}
          <button
            type="button"
            aria-label={`Cycle severity for ${record.substance}`}
            title="Change allergy severity"
            onClick={() =>
              void updateAllergyRecord(
                record.id,
                { severity: record.severity === "mild" ? "moderate" : record.severity === "moderate" ? "severe" : "mild" },
                mode,
              )
            }
          >
            <StatusPill label={record.severity} tone={severityTone[record.severity]} />
          </button>
          <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--color-red-tint)]" aria-label={`Remove ${record.substance}`} onClick={() => void removeAllergyRecord(record.id, mode)}>
            <X size={14} />
          </button>
        </span>
      ))}

      {legacy.map((value) => (
        <span key={value} className="break-words rounded bg-[var(--color-surface)] px-1.5 py-1 text-sm font-semibold text-[var(--color-red-text)]">
          {value}
        </span>
      ))}

      <button
        type="button"
        onClick={() => setAdding((open) => !open)}
        className="ml-auto inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-surface)]"
        aria-expanded={adding}
      >
        <Plus size={15} /> Add
      </button>

      {adding && (
        <div className="absolute right-0 top-full z-50 mt-1 w-[320px] max-w-[calc(100vw-24px)] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[var(--color-ink)] shadow-lg max-[560px]:left-0 max-[560px]:right-auto">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-secondary)]">
              Allergy <span className="text-[var(--color-red-solid)]">*</span>
            </span>
            <SuggestionInput
              value={substance}
              suggestions={ALLERGY_OPTIONS}
              placeholder="Search or enter allergy"
              onChange={setSubstance}
              onSubmit={() => void add()}
            />
          </label>
          <label className="mt-2 block">
            <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-secondary)]">Severity</span>
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value as AllergySeverity)}
              className="min-h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] px-2.5 text-sm"
            >
              <option value="mild">Mild</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </select>
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="min-h-10 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold">
              Cancel
            </button>
            <button type="button" onClick={() => void add()} disabled={!substance.trim()} className="min-h-10 rounded-md bg-[var(--color-red-solid)] px-3 text-sm font-semibold text-white disabled:opacity-50">
              Add allergy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
