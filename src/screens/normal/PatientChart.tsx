import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { QrCode, X } from "lucide-react";
import {
  useEncounterView,
  useClinicalEvents,
  useAuditEvents,
} from "../../db/hooks";
import { TriageBadge } from "../../components/TriageBadge";
import { AiChip } from "../../components/AiChip";
import { PatientIdentityModal } from "../../components/PatientIdentityModal";
import { PatientJourney } from "../../components/PatientJourney";
import { PatientVisits } from "../../components/PatientVisits";
import {
  AssessmentWorkflow,
  CareWorkflow,
  DispositionWorkflow,
  OrdersWorkflow,
  TriageHistory,
} from "./ClinicalWorkflow";
import {
  updatePatientField,
  updateEncounterField,
  addAllergy,
  removeAllergy,
  setTriage,
  addClinicalEvent,
} from "../../db/repo";
import { useAppStore } from "../../store/useAppStore";
import { triageRank, isEsi } from "../../lib/triage";
import type { EsiLevel } from "../../types";

const TABS = ["Journey", "Overview", "Assessment", "Orders", "Care", "Triage", "Disposition", "Notes", "Visits", "History"] as const;
type Tab = (typeof TABS)[number];

const ESI_DESCRIPTIONS: Record<EsiLevel, string> = {
  1: "Immediate life-saving intervention required",
  2: "High risk situation, severe pain/distress",
  3: "Multiple resources needed, stable",
  4: "One resource needed, stable",
  5: "No resources needed, stable",
};

export function PatientChart() {
  const { encounterId } = useParams<{ encounterId: string }>();
  const view = useEncounterView(encounterId);
  const [tab, setTab] = useState<Tab>("Journey");
  const [retriageOpen, setRetriageOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);

  if (!view) {
    return <div className="p-3 text-sm text-[var(--color-ink-secondary)]">Patient not found.</div>;
  }

  const { patient, encounter, triage } = view;
  const initials = (patient.name ?? patient.displayNumber)
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto max-w-[1440px] space-y-3 p-3">
      <div className="card flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
          style={{ background: "var(--color-primary-tint)", color: "var(--color-primary)" }}
        >
          {initials}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{patient.name ?? "Unknown"}</span>
            <span className="text-sm font-semibold text-[var(--color-primary)]">{patient.mrn ?? patient.displayNumber}</span>
            <span className="text-sm text-[var(--color-ink-secondary)]">Case {encounter.caseNumber ?? encounter.id.slice(0, 8)}</span>
            {patient.dateOfBirth && (
              <span className="text-sm text-[var(--color-ink-secondary)]">
                | {ageFromDob(patient.dateOfBirth)}y
              </span>
            )}
            {patient.sex && (
              <span className="text-sm text-[var(--color-ink-secondary)]">| {patient.sex}</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <TriageBadge level={triage} />
            <span className="text-sm text-[var(--color-ink-secondary)]">
              {encounter.currentLocationName ?? "Unassigned"}
            </span>
          </div>
        </div>
        <button
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
          onClick={() => setIdentityOpen(true)}
        >
          <QrCode size={15} />
          PIN / QR
        </button>
        <button
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
          onClick={() => setRetriageOpen(true)}
        >
          Re-triage
        </button>
        <button
          className="rounded-md px-3 py-1.5 text-sm text-white"
          style={{ background: "var(--color-primary)" }}
          onClick={() => setTab("Disposition")}
        >
          Disposition
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-2.5 py-1.5 text-sm ${
              tab === t
                ? "border-[var(--color-primary)] font-semibold text-[var(--color-primary)]"
                : "border-transparent text-[var(--color-ink-secondary)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Journey" && <PatientJourney encounterId={encounter.id} />}
      {tab === "Overview" && <OverviewTab encounterId={encounter.id} patientId={patient.id} />}
      {tab === "Assessment" && <AssessmentWorkflow encounterId={encounter.id} />}
      {tab === "Orders" && <OrdersWorkflow encounterId={encounter.id} />}
      {tab === "Care" && <CareWorkflow encounterId={encounter.id} />}
      {tab === "Triage" && <TriageHistory encounterId={encounter.id} />}
      {tab === "Disposition" && <DispositionWorkflow encounterId={encounter.id} />}
      {tab === "Notes" && <NotesTab encounterId={encounter.id} />}
      {tab === "Visits" && <PatientVisits patientId={patient.id} currentEncounterId={encounter.id} />}
      {tab === "History" && <HistoryTab patientId={patient.id} encounterId={encounter.id} />}

      {retriageOpen && (
        <RetriageModal
          encounterId={encounter.id}
          currentLevel={triage}
          onClose={() => setRetriageOpen(false)}
        />
      )}
      {identityOpen && (
        <PatientIdentityModal
          patient={patient}
          encounter={encounter}
          triage={triage}
          onClose={() => setIdentityOpen(false)}
        />
      )}
    </div>
  );
}

function ageFromDob(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

const PATIENT_DETAILS_SECTIONS = ["Basic", "Contact", "Emergency", "Medical", "Arrival"] as const;
type PatientDetailsSection = (typeof PATIENT_DETAILS_SECTIONS)[number];

function OverviewTab({ encounterId, patientId }: { encounterId: string; patientId: string }) {
  const view = useEncounterView(encounterId);
  const events = useClinicalEvents(encounterId);
  const mode = useAppStore((s) => s.mode);
  const [newAllergy, setNewAllergy] = useState("");
  const [detailsSection, setDetailsSection] = useState<PatientDetailsSection>("Basic");

  if (!view) return null;
  const { patient, encounter } = view;

  const vitalsEvent = events.find((e) => e.type === "vitals");
  const vitals = (vitalsEvent?.content ?? {}) as {
    bp?: string;
    hr?: number;
    spo2?: number;
    temp?: string;
  };

  const recentEvents = events.slice(0, 6);

  return (
    <div className="grid grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] gap-3 max-[980px]:grid-cols-1">
      <div>
        <div className="card space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Patient details</h2>
              <p className="text-xs text-[var(--color-ink-secondary)]">Choose a section to review or edit.</p>
            </div>
            <span className="text-xs font-semibold text-[var(--color-primary)]">Autosaves</span>
          </div>

          <div className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)] pb-1" role="tablist" aria-label="Patient detail sections">
            {PATIENT_DETAILS_SECTIONS.map((section) => (
              <button
                key={section}
                type="button"
                role="tab"
                aria-selected={detailsSection === section}
                onClick={() => setDetailsSection(section)}
                className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-semibold ${
                  detailsSection === section
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)]"
                }`}
              >
                {section}
              </button>
            ))}
          </div>

          {detailsSection === "Basic" && (
            <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
              <div className="col-span-2 max-[560px]:col-span-1">
                <EditableField label="Name" value={patient.name ?? ""} onSave={(v) => updatePatientField(patientId, "name", v || null, mode)} />
              </div>
              <EditableField label="Date of birth" type="date" value={patient.dateOfBirth ?? ""} onSave={(v) => updatePatientField(patientId, "dateOfBirth", v || null, mode)} />
              <SelectField label="Sex" value={patient.sex ?? "unknown"} options={["male", "female", "unknown"]} onSave={(v) => updatePatientField(patientId, "sex", v, mode)} />
              <EditableField label="Phone" value={patient.phone ?? ""} onSave={(v) => updatePatientField(patientId, "phone", v || null, mode)} />
              <EditableField label="Blood group" value={patient.bloodGroup ?? ""} onSave={(v) => updatePatientField(patientId, "bloodGroup", v || null, mode)} />
            </div>
          )}

          {detailsSection === "Contact" && (
            <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
              <EditableField label="National ID" value={patient.nationalId ?? ""} onSave={(v) => updatePatientField(patientId, "nationalId", v || null, mode)} />
              <EditableField label="Nationality" value={patient.nationality ?? ""} onSave={(v) => updatePatientField(patientId, "nationality", v || null, mode)} />
              <EditableField label="Email" type="email" value={patient.email ?? ""} onSave={(v) => updatePatientField(patientId, "email", v || null, mode)} />
              <EditableField label="Preferred language" value={patient.preferredLanguage ?? ""} onSave={(v) => updatePatientField(patientId, "preferredLanguage", v || null, mode)} />
              <EditableField label="Address" value={patient.address ?? ""} onSave={(v) => updatePatientField(patientId, "address", v || null, mode)} />
              <EditableField label="City / district" value={patient.city ?? ""} onSave={(v) => updatePatientField(patientId, "city", v || null, mode)} />
            </div>
          )}

          {detailsSection === "Emergency" && (
            <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
              <EditableField label="Contact name" value={patient.emergencyContactName ?? patient.emergencyContact ?? ""} onSave={(v) => updatePatientField(patientId, "emergencyContactName", v || null, mode)} />
              <EditableField label="Relationship" value={patient.emergencyContactRelationship ?? ""} onSave={(v) => updatePatientField(patientId, "emergencyContactRelationship", v || null, mode)} />
              <EditableField label="Contact phone" value={patient.emergencyContactPhone ?? ""} onSave={(v) => updatePatientField(patientId, "emergencyContactPhone", v || null, mode)} />
              <EditableField label="Insurance provider" value={patient.insuranceProvider ?? patient.insurance ?? ""} onSave={(v) => updatePatientField(patientId, "insuranceProvider", v || null, mode)} />
              <EditableField label="Policy / member number" value={patient.insurancePolicyNumber ?? ""} onSave={(v) => updatePatientField(patientId, "insurancePolicyNumber", v || null, mode)} />
            </div>
          )}

          {detailsSection === "Medical" && (
            <div className="space-y-3">
              <TextAreaField label="Known conditions" value={(patient.knownConditions ?? []).join(", ")} onSave={(v) => updatePatientField(patientId, "knownConditions", splitCommaList(v), mode)} />
              <TextAreaField label="Current medications" value={(patient.currentMedications ?? []).join(", ")} onSave={(v) => updatePatientField(patientId, "currentMedications", splitCommaList(v), mode)} />
              <div>
                <div className="mb-1 text-sm font-semibold text-[var(--color-ink-secondary)]">Allergies</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {encounter.allergies.map((allergy) => (
                    <span key={allergy} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm" style={{ background: "var(--color-red-tint)", color: "var(--color-red-text)" }}>
                      {allergy}<button aria-label={`Remove ${allergy}`} onClick={() => removeAllergy(encounterId, allergy, mode)}><X size={14} /></button>
                    </span>
                  ))}
                  <input
                    value={newAllergy}
                    onChange={(event) => setNewAllergy(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && newAllergy.trim()) {
                        addAllergy(encounterId, newAllergy.trim(), mode);
                        setNewAllergy("");
                      }
                    }}
                    placeholder="Add allergy"
                    className="min-w-28 rounded-md border border-dashed border-[var(--color-border)] px-2 py-1.5 text-sm outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {detailsSection === "Arrival" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
                <SelectField label="Arrival method" value={encounter.arrivalMethod ?? "walk_in"} options={["walk_in", "ambulance", "transfer", "police", "other"]} onSave={(v) => updateEncounterField(encounterId, "arrivalMethod", v, mode)} />
                <EditableField label="Referral source" value={encounter.referralSource ?? ""} onSave={(v) => updateEncounterField(encounterId, "referralSource", v || null, mode)} />
              </div>
              <TextAreaField label="Chief complaint" value={encounter.chiefComplaint ?? ""} onSave={(v) => updateEncounterField(encounterId, "chiefComplaint", v || null, mode)} />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Latest vitals</h2>
            <button
              className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs"
              onClick={() =>
                addClinicalEvent(
                  encounterId,
                  "vitals",
                  {
                    bp: "120/80",
                    hr: 78,
                    spo2: 98,
                    temp: "37.0",
                  },
                  null,
                )
              }
            >
              Record vitals
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <VitalStat label="BP" value={vitals.bp ?? "-"} />
            <VitalStat label="HR" value={vitals.hr ? String(vitals.hr) : "-"} />
            <VitalStat label="SpO2" value={vitals.spo2 ? `${vitals.spo2}%` : "-"} />
            <VitalStat label="Temp" value={vitals.temp ? `${vitals.temp}°` : "-"} />
          </div>
        </div>

        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Recent events</h2>
          {recentEvents.length === 0 ? (
            <div className="text-sm text-[var(--color-ink-secondary)]">No events recorded yet.</div>
          ) : (
            <div className="space-y-1.5">
              {recentEvents.map((e) => (
                <div key={e.id} className="flex justify-between border-b border-[var(--color-border)] pb-1.5 text-sm last:border-0 last:pb-0">
                  <span className="capitalize">{e.type.replace(/_/g, " ")}</span>
                  <span className="text-[var(--color-ink-secondary)]">
                    {new Date(e.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VitalStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-0.5 text-xs font-semibold uppercase text-[var(--color-ink-secondary)]">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

type SaveState = "idle" | "saving" | "saved";
type SaveFn = (v: string) => void | Promise<unknown>;

function useDebouncedSave(value: string, local: string, onSave: SaveFn) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (local === value) {
      setSaveState("idle");
      return undefined;
    }

    setSaveState("saving");
    const timeout = window.setTimeout(() => {
      void Promise.resolve(onSaveRef.current(local)).then(() => {
        setSaveState("saved");
        window.setTimeout(() => setSaveState("idle"), 1200);
      });
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [local, value]);

  return saveState;
}

function FieldLabel({ label, saveState }: { label: string; saveState: SaveState }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <span className="text-xs font-semibold uppercase text-[var(--color-ink-secondary)]">{label}</span>
      {saveState !== "idle" && (
        <span className="text-xs font-semibold uppercase text-[var(--color-primary)]">
          {saveState === "saving" ? "Saving" : "Saved"}
        </span>
      )}
    </div>
  );
}

function EditableField({
  label,
  value,
  onSave,
  type = "text",
}: {
  label: string;
  value: string;
  onSave: SaveFn;
  type?: string;
}) {
  const [local, setLocal] = useState(value);
  const saveState = useDebouncedSave(value, local, onSave);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  return (
    <label className="block">
      <FieldLabel label={label} saveState={saveState} />
      <input
        type={type}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        className="w-full border-b border-[var(--color-border)] bg-transparent pb-1 text-sm outline-none focus:border-[var(--color-primary)]"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: SaveFn;
}) {
  const [local, setLocal] = useState(value);
  const saveState = useDebouncedSave(value, local, onSave);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  return (
    <label className="block">
      <FieldLabel label={label} saveState={saveState} />
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        rows={2}
        className="w-full resize-none rounded-md border border-[var(--color-border)] p-2 text-sm outline-none focus:border-[var(--color-primary)]"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onSave,
}: {
  label: string;
  value: string;
  options: string[];
  onSave: SaveFn;
}) {
  const [local, setLocal] = useState(value);
  const saveState = useDebouncedSave(value, local, onSave);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  return (
    <label className="block">
      <FieldLabel label={label} saveState={saveState} />
      <select
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        className="w-full border-b border-[var(--color-border)] bg-transparent pb-1 text-sm capitalize outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </label>
  );
}

function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function NotesTab({ encounterId }: { encounterId: string }) {
  const events = useClinicalEvents(encounterId);
  const notes = events.filter((e) => e.type === "note" || e.type === "voice_note");
  return (
    <div className="space-y-3">
      <div className="card flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AiChip />
          <span className="text-sm text-[var(--color-ink-secondary)]">
            Summarize notes - AI features coming soon
          </span>
        </div>
        <button
          disabled
          className="text-xs rounded-lg px-2.5 py-1.5 border border-[var(--color-border)] text-[var(--color-ink-secondary)] cursor-not-allowed"
          title="AI features coming soon"
        >
          Summarize notes
        </button>
      </div>
      {notes.length === 0 ? (
        <div className="card text-sm text-[var(--color-ink-secondary)]">
          No notes yet - clinical notes appear here.
        </div>
      ) : (
        notes.map((n) => (
          <div key={n.id} className="card text-sm">
            {n.type === "voice_note" ? (
              <div className="flex items-center justify-between">
                <span>Voice note ({(n.content as { durationSec?: number })?.durationSec ?? 0}s)</span>
                <span className="text-xs text-[var(--color-ink-secondary)]">Transcription pending</span>
              </div>
            ) : (
              <span>{String((n.content as { text?: string })?.text ?? "")}</span>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function HistoryTab({ patientId, encounterId }: { patientId: string; encounterId: string }) {
  const patientAudits = useAuditEvents(patientId);
  const encounterAudits = useAuditEvents(encounterId);
  const combined = [...patientAudits, ...encounterAudits].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="card">
      <h2 className="text-sm font-medium mb-3">History</h2>
      {combined.length === 0 ? (
        <div className="text-sm text-[var(--color-ink-secondary)]">No history recorded yet.</div>
      ) : (
        <div className="space-y-2">
          {combined.map((a) => (
            <div key={a.id} className="flex justify-between text-sm border-b border-[var(--color-border)] last:border-0 pb-2 last:pb-0">
              <span>
                {a.action.replace(/_/g, " ")}
                {a.previousValue ? ` (was "${a.previousValue}")` : ""}
                {a.newValue ? ` -> "${a.newValue}"` : ""}
                {a.actor ? ` | ${a.actor}` : ""}
              </span>
              <span className="text-[var(--color-ink-secondary)] shrink-0 ml-3">
                {new Date(a.timestamp).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RetriageModal({
  encounterId,
  currentLevel,
  onClose,
}: {
  encounterId: string;
  currentLevel: EsiLevel | string | number | null;
  onClose: () => void;
}) {
  const mode = useAppStore((s) => s.mode);
  const [pendingLevel, setPendingLevel] = useState<EsiLevel | null>(null);
  const [needsSecondSig, setNeedsSecondSig] = useState(false);

  const levels: EsiLevel[] = [1, 2, 3, 4, 5];

  function pick(level: EsiLevel) {
    const isDowngrade =
      currentLevel !== null && isEsi(currentLevel as never) && triageRank(level) > triageRank(currentLevel as EsiLevel);
    if (isDowngrade) {
      setPendingLevel(level);
      setNeedsSecondSig(true);
    } else {
      void setTriage(encounterId, "esi", level, mode).then(onClose);
    }
  }

  function confirmSecondSig() {
    if (pendingLevel === null) return;
    void setTriage(encounterId, "esi", pendingLevel, mode, "Downgrade confirmed with second signature").then(onClose);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 w-[420px]" onClick={(e) => e.stopPropagation()}>
        {!needsSecondSig ? (
          <>
            <h2 className="text-sm font-medium mb-3">Select new ESI level</h2>
            <div className="space-y-2">
              {levels.map((level) => (
                <button
                  key={level}
                  onClick={() => pick(level)}
                  className="w-full text-left rounded-lg border border-[var(--color-border)] px-3 py-2.5 hover:border-[var(--color-primary)]"
                >
                  <div className="flex items-center gap-2">
                    <TriageBadge level={level} size="sm" />
                    <span className="text-sm text-[var(--color-ink-secondary)]">
                      {ESI_DESCRIPTIONS[level]}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h2 className="text-sm font-medium mb-2">Second signature required</h2>
            <p className="text-sm text-[var(--color-ink-secondary)] mb-4">
              Downgrading acuity to ESI {pendingLevel} requires a second provider's authorization.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-sm border border-[var(--color-border)]"
              >
                Cancel
              </button>
              <button
                onClick={confirmSecondSig}
                className="rounded-lg px-3 py-1.5 text-sm text-white"
                style={{ background: "var(--color-primary)" }}
              >
                Confirm second signature
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
