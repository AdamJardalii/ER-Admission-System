import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Camera, Check, Search, UserPlus } from "lucide-react";
import { createCriticalPatient, createEncounterForExistingPatient, createQuickRegistration, completeRegistration, updateEncounterField } from "../../db/repo";
import { useAllPatients, usePatientEncounters } from "../../db/hooks";
import { fuzzyPatientMatches, birthYear } from "../../lib/registration";
import { PhotoCaptureModal } from "../../components/PhotoCaptureModal";
import type { AgeBand, Patient, Sex } from "../../types";

const AGE_BANDS: AgeBand[] = ["0-1", "1-5", "5-12", "13-17", "18-30", "31-50", "51-70", "70+"];
const GOVERNORATES = ["Beirut", "Mount Lebanon", "North", "Akkar", "Baalbek-Hermel", "Beqaa", "South", "Nabatieh"];

const inputClass = "w-full rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]";

type Depth = "quick" | "full";

export function RegistrationForm() {
  const navigate = useNavigate();
  const patients = useAllPatients();
  const [query, setQuery] = useState("");
  const [searchDob, setSearchDob] = useState("");
  const [searchNationalId, setSearchNationalId] = useState("");
  const [canCreate, setCanCreate] = useState(false);
  const [depth, setDepth] = useState<Depth>("quick");
  const [saving, setSaving] = useState(false);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    sex: "unknown" as Sex,
    dob: "",
    ageBand: "18-30" as AgeBand,
    useDob: false,
    chiefComplaint: "",
    phone: "",
    nationalId: "",
    governorate: "Beirut",
    district: "",
    address: "",
    emergencyName: "",
    emergencyRelation: "",
    emergencyPhone: "",
    allergies: "",
    currentMedications: "",
    preferredLanguage: "Arabic",
  });

  const matches = useMemo(
    () => fuzzyPatientMatches(patients, { text: query, phone: query, nationalId: searchNationalId || form.nationalId, dob: searchDob || form.dob }),
    [patients, query, searchNationalId, form.nationalId, searchDob, form.dob],
  );
  const strongMatch = matches.some((match) => match.strong);
  const nationalIdMatch = form.nationalId
    ? patients.find((patient) => patient.nationalId && patient.nationalId === form.nationalId)
    : null;

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function openExisting(patient: Patient) {
    if (saving) return;
    setSaving(true);
    try {
      const encounter = await createEncounterForExistingPatient(patient, form.chiefComplaint || null);
      navigate(`/patients/${encounter.id}?tab=Triage`);
    } finally {
      setSaving(false);
    }
  }

  async function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (saving || !canCreate || !form.name.trim() || !form.chiefComplaint.trim()) return;
    setSaving(true);
    try {
      const created = await createQuickRegistration({
        name: form.name,
        sex: form.sex,
        dob: form.useDob ? form.dob || null : null,
        estimatedAgeRange: form.useDob ? null : form.ageBand,
        chiefComplaint: form.chiefComplaint,
        duplicateOverride: strongMatch,
      });
      if (depth === "full") {
        await completeRegistration(created.patient.id, {
          phone: form.phone || null,
          nationalId: form.nationalId || null,
          address: [form.governorate, form.district, form.address].filter(Boolean).join(" | ") || null,
          city: form.district || form.governorate,
          emergencyContact: [form.emergencyName, form.emergencyRelation, form.emergencyPhone].filter(Boolean).join(" | ") || null,
          emergencyContactName: form.emergencyName || null,
          emergencyContactRelationship: form.emergencyRelation || null,
          emergencyContactPhone: form.emergencyPhone || null,
          currentMedications: splitList(form.currentMedications),
          preferredLanguage: form.preferredLanguage,
          photoBlob,
        }, created.encounter.id, "normal");
        await updateEncounterField(created.encounter.id, "allergies", splitList(form.allergies), "normal");
      }
      navigate(`/patients/${created.encounter.id}?tab=Triage`);
    } finally {
      setSaving(false);
    }
  }

  async function criticalFastPath() {
    if (saving) return;
    setSaving(true);
    try {
      const { encounter } = await createCriticalPatient();
      navigate(`/patients/${encounter.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-[1280px] space-y-3 p-3">
      <div className="card flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <p className="text-xs font-bold uppercase text-[var(--color-primary)]">Search before create</p>
          <h1 className="text-lg font-semibold">New patient</h1>
        </div>
        <button type="button" onClick={() => void criticalFastPath()} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-red-solid)] px-3 py-1.5 text-sm font-semibold text-white">
          <AlertTriangle size={16} /> Critical: treat now
        </button>
        <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
          <ArrowLeft size={16} /> Cancel
        </button>
      </div>

      <section className="card space-y-3">
        <div className="grid grid-cols-[1fr_170px_180px] gap-2 max-[760px]:grid-cols-1">
          <Field label="Name, phone, MRN, national ID, or catastrophe tag">
            <div className="relative">
              <Search size={15} className="absolute left-2 top-2 text-[var(--color-ink-secondary)]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Karim Salem, 410111, MRN-100001, #B-2999" className={`${inputClass} pl-8`} autoFocus />
            </div>
          </Field>
          <Field label="DOB">
            <input type="date" value={searchDob} onChange={(event) => setSearchDob(event.target.value)} className={inputClass} />
          </Field>
          <Field label="National ID">
            <input value={searchNationalId} onChange={(event) => setSearchNationalId(event.target.value)} className={inputClass} />
          </Field>
        </div>

        {matches.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2">
            {matches.map((match) => (
              <CandidateCard key={match.patient.id} patient={match.patient} reasons={match.reasons} strong={match.strong} onOpen={() => void openExisting(match.patient)} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-ink-secondary)]">No candidates yet. Search is required before registration opens.</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!query.trim() && !searchDob && !searchNationalId}
            onClick={() => {
              setCanCreate(true);
              setForm((current) => ({ ...current, name: current.name || query }));
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          >
            <UserPlus size={15} /> Register as new
          </button>
          {strongMatch && <span className="rounded-full bg-[var(--color-yellow-tint)] px-2 py-1 text-xs font-bold text-[var(--color-yellow-text)]">Strong duplicate match: override will be audited</span>}
        </div>
      </section>

      {canCreate && (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-sm font-semibold">Registration depth</h2>
            {(["quick", "full"] as Depth[]).map((value) => (
              <button key={value} type="button" onClick={() => setDepth(value)} className={`rounded-md px-3 py-1.5 text-sm font-semibold capitalize ${depth === value ? "bg-[var(--color-primary)] text-white" : "border border-[var(--color-border)]"}`}>
                {value}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-2 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
            <Field label="Name" className="col-span-2 max-[900px]:col-span-2 max-[560px]:col-span-1">
              <input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Unknown male ~30" className={inputClass} required />
            </Field>
            <Field label="Sex">
              <select value={form.sex} onChange={(event) => update("sex", event.target.value as Sex)} className={inputClass}>
                <option value="unknown">Unknown</option>
                <option value="male">M</option>
                <option value="female">F</option>
              </select>
            </Field>
            <Field label="Age">
              <div className="flex gap-1">
                <select value={form.useDob ? "dob" : "band"} onChange={(event) => update("useDob", event.target.value === "dob")} className={`${inputClass} w-24`}>
                  <option value="band">Band</option>
                  <option value="dob">DOB</option>
                </select>
                {form.useDob ? (
                  <input type="date" value={form.dob} onChange={(event) => update("dob", event.target.value)} className={inputClass} />
                ) : (
                  <select value={form.ageBand} onChange={(event) => update("ageBand", event.target.value as AgeBand)} className={inputClass}>
                    {AGE_BANDS.map((band) => <option key={band}>{band}</option>)}
                  </select>
                )}
              </div>
            </Field>
            <Field label="Chief complaint" className="col-span-4 max-[900px]:col-span-2 max-[560px]:col-span-1">
              <input value={form.chiefComplaint} onChange={(event) => update("chiefComplaint", event.target.value)} placeholder="Chest pain, fever, fall..." className={inputClass} required />
            </Field>
          </div>

          {depth === "full" && (
            <div className="grid grid-cols-4 gap-2 border-t border-[var(--color-border)] pt-3 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
              <Field label="Phone"><input value={form.phone} onChange={(event) => update("phone", event.target.value)} className={inputClass} /></Field>
              <Field label="National ID">
                <input value={form.nationalId} onChange={(event) => update("nationalId", event.target.value)} placeholder="0000-0000-0000" className={inputClass} />
                {nationalIdMatch && <span className="mt-1 block text-xs font-semibold text-[var(--color-red-solid)]">Matches {nationalIdMatch.name ?? nationalIdMatch.mrn}</span>}
              </Field>
              <Field label="Governorate"><select value={form.governorate} onChange={(event) => update("governorate", event.target.value)} className={inputClass}>{GOVERNORATES.map((name) => <option key={name}>{name}</option>)}</select></Field>
              <Field label="District"><input value={form.district} onChange={(event) => update("district", event.target.value)} className={inputClass} /></Field>
              <Field label="Address" className="col-span-2 max-[560px]:col-span-1"><input value={form.address} onChange={(event) => update("address", event.target.value)} className={inputClass} /></Field>
              <Field label="Emergency name"><input value={form.emergencyName} onChange={(event) => update("emergencyName", event.target.value)} className={inputClass} /></Field>
              <Field label="Relation"><input value={form.emergencyRelation} onChange={(event) => update("emergencyRelation", event.target.value)} className={inputClass} /></Field>
              <Field label="Emergency phone"><input value={form.emergencyPhone} onChange={(event) => update("emergencyPhone", event.target.value)} className={inputClass} /></Field>
              <Field label="Allergies"><input value={form.allergies} onChange={(event) => update("allergies", event.target.value)} className={inputClass} /></Field>
              <Field label="Medications"><input value={form.currentMedications} onChange={(event) => update("currentMedications", event.target.value)} className={inputClass} /></Field>
              <Field label="Language"><select value={form.preferredLanguage} onChange={(event) => update("preferredLanguage", event.target.value)} className={inputClass}><option>Arabic</option><option>English</option><option>French</option></select></Field>
              <div className="flex items-end">
                <button type="button" onClick={() => setPhotoOpen(true)} className="inline-flex h-[36px] items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold">
                  <Camera size={15} /> {photoBlob ? "Photo captured" : "Capture photo"}
                </button>
              </div>
            </div>
          )}

          <button type="submit" disabled={saving || !form.name.trim() || !form.chiefComplaint.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <Check size={16} /> {saving ? "Saving" : depth === "quick" ? "Quick register to triage" : "Full register to triage"}
          </button>
        </section>
      )}

      {photoOpen && <PhotoCaptureModal onClose={() => setPhotoOpen(false)} onSave={(blob) => { setPhotoBlob(blob); setPhotoOpen(false); }} />}
    </form>
  );
}

function CandidateCard({ patient, reasons, strong, onOpen }: { patient: Patient; reasons: string[]; strong: boolean; onOpen: () => void }) {
  const visits = usePatientEncounters(patient.id);
  const latest = visits[0];
  const initials = (patient.name ?? patient.displayNumber).split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  return (
    <article className={`rounded-md border p-3 ${strong ? "border-[var(--color-yellow-solid)] bg-[var(--color-yellow-tint)]" : "border-[var(--color-border)] bg-[var(--color-surface-muted)]"}`}>
      <div className="flex gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-bold text-white">{initials}</div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{patient.name ?? "Unknown"}</div>
          <div className="text-xs text-[var(--color-ink-secondary)]">{patient.mrn ?? patient.displayNumber} | {patient.dateOfBirth ? `${ageFromYear(birthYear(patient.dateOfBirth))}y` : patient.estimatedAgeRange ?? "age unknown"} | {patient.sex ?? "unknown"}</div>
          <div className="text-xs text-[var(--color-ink-secondary)]">Last visit {latest ? new Date(latest.arrivedAt).toLocaleDateString() : "none"} | {reasons.join(", ")}</div>
        </div>
      </div>
      <button type="button" onClick={onOpen} className="mt-2 w-full rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-white">
        This is the patient
      </button>
    </article>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-bold uppercase text-[var(--color-ink-secondary)]">{label}</span>
      {children}
    </label>
  );
}

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function ageFromYear(year: string | null) {
  return year ? new Date().getFullYear() - Number(year) : "?";
}
