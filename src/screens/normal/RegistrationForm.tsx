import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Bed, Check, UserPlus } from "lucide-react";
import { db } from "../../db/db";
import { uuid, nextCaseNumber, nextDisplayNumber, nextMrn } from "../../db/ids";
import { writeAudit } from "../../db/audit";
import { setTriage, assignLocation, createCriticalPatient } from "../../db/repo";
import { useZones, useBeds } from "../../db/hooks";
import { triagePalette } from "../../lib/triage";
import { MrnImportPanel } from "../../components/MrnImportPanel";
import type { ArrivalMethod, Patient, Encounter, EsiLevel, Sex } from "../../types";

const ESI_LEVELS: { level: EsiLevel; label: string; title: string; description: string }[] = [
  { level: 1, label: "1", title: "Resus", description: "Immediate intervention" },
  { level: 2, label: "2", title: "High risk", description: "Severe pain or unstable" },
  { level: 3, label: "3", title: "Urgent", description: "Multiple resources" },
  { level: 4, label: "4", title: "Less urgent", description: "One resource" },
  { level: 5, label: "5", title: "Fast", description: "No resources" },
];

type IntakeTab = "intake" | "identity" | "contact" | "medical" | "arrival";

const INTAKE_TABS: { id: IntakeTab; label: string }[] = [
  { id: "intake", label: "Details" },
  { id: "identity", label: "Identity" },
  { id: "contact", label: "Contact" },
  { id: "medical", label: "Medical" },
  { id: "arrival", label: "Arrival" },
];

export function RegistrationForm() {
  const navigate = useNavigate();
  const zones = useZones();
  const beds = useBeds();
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState<Sex>("unknown");
  const [phone, setPhone] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [nationality, setNationality] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyRelationship, setEmergencyRelationship] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [insuranceProvider, setInsuranceProvider] = useState("");
  const [insurancePolicy, setInsurancePolicy] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [knownConditions, setKnownConditions] = useState("");
  const [currentMedications, setCurrentMedications] = useState("");
  const [arrivalMethod, setArrivalMethod] = useState<ArrivalMethod>("walk_in");
  const [referralSource, setReferralSource] = useState("");
  const [intakeTab, setIntakeTab] = useState<IntakeTab>("intake");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [allergiesText, setAllergiesText] = useState("");
  const [esi, setEsi] = useState<EsiLevel | null>(null);
  const [bedId, setBedId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [existingPatient, setExistingPatient] = useState<Patient | null>(null);

  async function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (saving) return;
    setSaving(true);
    const now = Date.now();
    const patientId = existingPatient?.id ?? uuid();
    const encounterId = uuid();
    const displayNumber = existingPatient?.displayNumber ?? nextDisplayNumber("normal");
    const mrn = existingPatient?.mrn ?? nextMrn();
    const caseNumber = nextCaseNumber();

    const patientUpdates: Partial<Patient> = {
      name: name || null,
      dateOfBirth: dob || null,
      sex,
      phone: phone || null,
      nationalId: nationalId || null,
      email: email || null,
      address: address || null,
      city: city || null,
      nationality: nationality || null,
      preferredLanguage: preferredLanguage || null,
      emergencyContact: [emergencyName, emergencyRelationship, emergencyPhone].filter(Boolean).join(" | ") || null,
      emergencyContactName: emergencyName || null,
      emergencyContactRelationship: emergencyRelationship || null,
      emergencyContactPhone: emergencyPhone || null,
      insurance: [insuranceProvider, insurancePolicy].filter(Boolean).join(" | ") || null,
      insuranceProvider: insuranceProvider || null,
      insurancePolicyNumber: insurancePolicy || null,
      bloodGroup: bloodGroup || null,
      knownConditions: splitList(knownConditions),
      currentMedications: splitList(currentMedications),
      identityStatus: name ? "confirmed" : "provisional",
    };

    const patient: Patient = {
      id: patientId,
      displayNumber,
      mrn,
      name: name || null,
      dateOfBirth: dob || null,
      sex,
      phone: phone || null,
      nationalId: nationalId || null,
      email: email || null,
      address: address || null,
      city: city || null,
      nationality: nationality || null,
      preferredLanguage: preferredLanguage || null,
      emergencyContact: [emergencyName, emergencyRelationship, emergencyPhone].filter(Boolean).join(" | ") || null,
      emergencyContactName: emergencyName || null,
      emergencyContactRelationship: emergencyRelationship || null,
      emergencyContactPhone: emergencyPhone || null,
      insurance: [insuranceProvider, insurancePolicy].filter(Boolean).join(" | ") || null,
      insuranceProvider: insuranceProvider || null,
      insurancePolicyNumber: insurancePolicy || null,
      bloodGroup: bloodGroup || null,
      knownConditions: splitList(knownConditions),
      currentMedications: splitList(currentMedications),
      photoBlob: null,
      identityStatus: name ? "confirmed" : "provisional",
      estimatedAgeRange: null,
      createdAt: now,
    };

    const encounter: Encounter = {
      id: encounterId,
      caseNumber,
      patientId,
      incidentId: null,
      modeAtCreation: "normal",
      arrivedAt: now,
      state: "arrived",
      disposition: null,
      closedAt: null,
      chiefComplaint: chiefComplaint || null,
      arrivalMethod,
      referralSource: referralSource || null,
      allergies: allergiesText
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      currentLocationName: null,
      currentZone: null,
      currentProvider: null,
    };

    try {
      if (existingPatient) {
        await db.patients.update(patientId, patientUpdates);
      } else {
        await db.patients.add(patient);
      }
      await db.encounters.add(encounter);
      await writeAudit({
        entityType: "encounter",
        entityId: encounterId,
        action: existingPatient ? "created_from_existing_mrn" : "created",
        newValue: caseNumber,
        mode: "normal",
      });
      if (esi) await setTriage(encounterId, "esi", esi, "normal");

      if (bedId) {
        const bed = beds.find((b) => b.id === bedId && !b.encounterId);
        if (bed) {
          await assignLocation(encounterId, bed.name, bed.zone, "normal");
          await db.beds.update(bedId, { encounterId });
        }
      }

      navigate(`/patients/${encounterId}`);
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

  function importPatient(patient: Patient, visits: Encounter[]) {
    const latestVisit = [...visits].sort((a, b) => b.arrivedAt - a.arrivedAt)[0];
    setExistingPatient(patient);
    setName(patient.name ?? "");
    setDob(patient.dateOfBirth ?? "");
    setSex(patient.sex ?? "unknown");
    setPhone(patient.phone ?? "");
    setNationalId(patient.nationalId ?? "");
    setEmail(patient.email ?? "");
    setAddress(patient.address ?? "");
    setCity(patient.city ?? "");
    setNationality(patient.nationality ?? "");
    setPreferredLanguage(patient.preferredLanguage ?? "");
    setEmergencyName(patient.emergencyContactName ?? patient.emergencyContact ?? "");
    setEmergencyRelationship(patient.emergencyContactRelationship ?? "");
    setEmergencyPhone(patient.emergencyContactPhone ?? "");
    setInsuranceProvider(patient.insuranceProvider ?? patient.insurance ?? "");
    setInsurancePolicy(patient.insurancePolicyNumber ?? "");
    setBloodGroup(patient.bloodGroup ?? "");
    setKnownConditions((patient.knownConditions ?? []).join(", "));
    setCurrentMedications((patient.currentMedications ?? []).join(", "));
    setAllergiesText((latestVisit?.allergies ?? []).join(", "));
    setIntakeTab("intake");
  }

  function clearImportedPatient() {
    setExistingPatient(null);
    setName("");
    setDob("");
    setSex("unknown");
    setPhone("");
    setNationalId("");
    setEmail("");
    setAddress("");
    setCity("");
    setNationality("");
    setPreferredLanguage("");
    setEmergencyName("");
    setEmergencyRelationship("");
    setEmergencyPhone("");
    setInsuranceProvider("");
    setInsurancePolicy("");
    setBloodGroup("");
    setKnownConditions("");
    setCurrentMedications("");
    setAllergiesText("");
  }

  const selectedBed = beds.find((b) => b.id === bedId);

  return (
    <form onSubmit={submit} className="mx-auto max-w-[1440px] space-y-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-white px-4 py-3 shadow-[0_4px_14px_rgba(23,32,51,0.05)]">
        <div className="min-w-[220px]">
          <p className="mb-0.5 text-xs font-bold uppercase text-[var(--color-primary)]">
            {existingPatient ? "Returning patient" : "Normal intake"}
          </p>
          <h1 className="text-lg font-semibold">{existingPatient ? "New ER encounter" : "New patient"}</h1>
        </div>

        <div className="grid flex-1 grid-cols-4 gap-2 text-xs max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
          <SummaryChip label="Patient" value={name || "Unknown"} />
          <SummaryChip label="MRN" value={existingPatient?.mrn ?? "New MRN"} />
          <SummaryChip label="Triage" value={esi ? `ESI ${esi}` : "Deferred"} />
          <SummaryChip label="Location" value={selectedBed?.name ?? "Unassigned"} />
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => void criticalFastPath()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-red-solid)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            title="Create a temporary identity and start immediate treatment"
          >
            <AlertTriangle size={16} />
            Critical: treat now
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm"
          >
            <ArrowLeft size={16} />
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "var(--color-primary)" }}
          >
            <UserPlus size={16} />
            {saving ? "Saving" : existingPatient ? "Create encounter" : "Register"}
          </button>
        </div>
      </div>

      <MrnImportPanel
        selectedPatientId={existingPatient?.id ?? null}
        onImport={importPatient}
        onClear={clearImportedPatient}
      />

      <div className="grid grid-cols-[minmax(300px,0.78fr)_minmax(0,1.65fr)] gap-3 max-[980px]:grid-cols-1">
        <section className={panelClass}>
          <PanelHeader eyebrow="Clinical intake" title="Patient details" />

          <div
            className="my-3 grid grid-cols-5 gap-1 rounded-md bg-[var(--color-page)] p-1"
            role="tablist"
            aria-label="Registration detail sections"
          >
            {INTAKE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={intakeTab === tab.id}
                aria-controls="clinical-intake-panel"
                onClick={() => setIntakeTab(tab.id)}
                className={`min-w-0 rounded px-1.5 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${
                  intakeTab === tab.id
                    ? "bg-white text-[var(--color-primary)] shadow-sm"
                    : "text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div id="clinical-intake-panel" role="tabpanel" className="grid min-h-[300px] grid-cols-2 content-start gap-2">
            {intakeTab === "intake" && (
              <>
                <Field label="Name" className="col-span-2">
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Unknown patient" className={inputClass} />
                </Field>
                <Field label="DOB"><input type="date" value={dob} onChange={(event) => setDob(event.target.value)} className={inputClass} /></Field>
                <Field label="Phone"><input value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClass} /></Field>
                <Field label="Sex" className="col-span-2">
                  <div className="grid grid-cols-3 gap-2">
                    {(["unknown", "male", "female"] as Sex[]).map((value) => (
                      <button
                        type="button"
                        key={value}
                        onClick={() => setSex(value)}
                        className={`rounded-md border px-2 py-1.5 text-xs font-semibold capitalize transition ${
                          sex === value
                            ? "border-[var(--color-primary)] bg-[var(--color-primary-tint)] text-[var(--color-primary)]"
                            : "border-[var(--color-border)] bg-white text-[var(--color-ink-secondary)] hover:border-[var(--color-primary)]"
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Chief complaint" className="col-span-2">
                  <textarea value={chiefComplaint} onChange={(event) => setChiefComplaint(event.target.value)} rows={3} placeholder="Chest pain, fever, fall..." className={`${inputClass} resize-none`} />
                </Field>
                <Field label="Allergies" className="col-span-2">
                  <input value={allergiesText} onChange={(event) => setAllergiesText(event.target.value)} placeholder="Penicillin, latex" className={inputClass} />
                </Field>
              </>
            )}

            {intakeTab === "identity" && (
              <>
                <Field label="National ID"><input value={nationalId} onChange={(event) => setNationalId(event.target.value)} className={inputClass} /></Field>
                <Field label="Nationality"><input value={nationality} onChange={(event) => setNationality(event.target.value)} className={inputClass} /></Field>
                <Field label="Email"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} /></Field>
                <Field label="Preferred language"><input value={preferredLanguage} onChange={(event) => setPreferredLanguage(event.target.value)} placeholder="Arabic, English, French" className={inputClass} /></Field>
                <Field label="Address"><input value={address} onChange={(event) => setAddress(event.target.value)} className={inputClass} /></Field>
                <Field label="City / district"><input value={city} onChange={(event) => setCity(event.target.value)} className={inputClass} /></Field>
              </>
            )}

            {intakeTab === "contact" && (
              <>
                <Field label="Contact name"><input value={emergencyName} onChange={(event) => setEmergencyName(event.target.value)} className={inputClass} /></Field>
                <Field label="Relationship"><input value={emergencyRelationship} onChange={(event) => setEmergencyRelationship(event.target.value)} placeholder="Parent, spouse, friend" className={inputClass} /></Field>
                <Field label="Contact phone"><input value={emergencyPhone} onChange={(event) => setEmergencyPhone(event.target.value)} className={inputClass} /></Field>
                <Field label="Blood group"><input value={bloodGroup} onChange={(event) => setBloodGroup(event.target.value)} placeholder="O+" className={inputClass} /></Field>
                <Field label="Insurance provider"><input value={insuranceProvider} onChange={(event) => setInsuranceProvider(event.target.value)} className={inputClass} /></Field>
                <Field label="Policy / member number"><input value={insurancePolicy} onChange={(event) => setInsurancePolicy(event.target.value)} className={inputClass} /></Field>
              </>
            )}

            {intakeTab === "medical" && (
              <>
                <Field label="Known conditions" className="col-span-2"><input value={knownConditions} onChange={(event) => setKnownConditions(event.target.value)} placeholder="Diabetes, asthma, hypertension" className={inputClass} /></Field>
                <Field label="Current medications" className="col-span-2"><input value={currentMedications} onChange={(event) => setCurrentMedications(event.target.value)} placeholder="Medication name and dose, separated by commas" className={inputClass} /></Field>
              </>
            )}

            {intakeTab === "arrival" && (
              <>
                <Field label="Arrival method">
                  <select value={arrivalMethod} onChange={(event) => setArrivalMethod(event.target.value as ArrivalMethod)} className={inputClass}>
                    <option value="walk_in">Walk-in</option>
                    <option value="ambulance">Ambulance</option>
                    <option value="transfer">Hospital transfer</option>
                    <option value="police">Police / security</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Referral source"><input value={referralSource} onChange={(event) => setReferralSource(event.target.value)} placeholder="Clinic, hospital, EMS unit" className={inputClass} /></Field>
              </>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <div className={panelClass}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <PanelHeader eyebrow="ESI triage" title="Acuity level" />
              <button
                type="button"
                onClick={() => setEsi(null)}
                className="rounded-full bg-[var(--color-page)] px-2.5 py-1 text-xs font-semibold text-[var(--color-ink-secondary)]"
              >
                Defer
              </button>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(104px,1fr))] gap-2">
              {ESI_LEVELS.map((l) => {
                const palette = triagePalette(l.level);
                const selected = esi === l.level;
                return (
                  <button
                    type="button"
                    key={l.level}
                    onClick={() => setEsi(l.level)}
                    className={`relative min-h-[94px] rounded-md border p-2 text-left transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${
                      selected ? "border-[var(--color-primary)] shadow-[0_8px_18px_rgba(23,32,51,0.10)]" : "border-[var(--color-border)]"
                    }`}
                    style={{ background: selected ? palette.tint : "var(--color-surface)" }}
                  >
                    <span
                      className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold"
                      style={{ background: palette.solid, color: palette.textOnSolid }}
                    >
                      {l.label}
                    </span>
                    <span className="block text-xs font-bold">{l.title}</span>
                    <span className="mt-1 block text-xs leading-4 text-[var(--color-ink-secondary)]">
                      {l.description}
                    </span>
                    {selected && (
                      <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-primary)] text-white">
                        <Check size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={panelClass}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <PanelHeader eyebrow="Location" title="Bed map" />
              <button
                type="button"
                onClick={() => setBedId("")}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  bedId
                    ? "bg-[var(--color-page)] text-[var(--color-ink-secondary)]"
                    : "bg-[var(--color-primary-tint)] text-[var(--color-primary)]"
                }`}
              >
                <Bed size={14} />
                Unassigned
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 max-[1120px]:grid-cols-1">
              {zones.map((zone) => {
                const zoneBeds = beds.filter((b) => b.zone === zone.id);
                const openCount = zoneBeds.filter((b) => !b.encounterId).length;
                const theme = zoneTheme(zone.id, zone.name);
                return (
                  <div
                    key={zone.id}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2.5"
                    style={{ borderLeft: `4px solid ${theme.accent}` }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold leading-none">{zone.name}</div>
                        <div className="text-xs text-[var(--color-ink-secondary)]">
                          {openCount} open of {zoneBeds.length}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(46px,1fr))] gap-1.5">
                      {zoneBeds.map((bed) => {
                        const occupied = Boolean(bed.encounterId);
                        const selected = bed.id === bedId;
                        return (
                          <button
                            type="button"
                            key={bed.id}
                            disabled={occupied}
                            onClick={() => setBedId(selected ? "" : bed.id)}
                            className={`min-h-9 rounded-md border px-1.5 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${
                              occupied
                                ? "cursor-not-allowed border-[var(--color-border-strong)] bg-[var(--color-occupied-bed-bg)] text-[var(--color-ink-secondary)]"
                                : selected
                                  ? "border-[var(--color-primary)] bg-[var(--color-primary-tint)] text-[var(--color-primary)] shadow-[0_6px_14px_rgba(23,32,51,0.10)]"
                                  : "border-[var(--color-open-bed-border)] bg-[var(--color-green-tint)] text-[var(--color-green-solid)] hover:border-[var(--color-green-solid)]"
                            }`}
                          >
                            {bed.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </form>
  );
}

const panelClass =
  "rounded-lg border border-[var(--color-border)] bg-white p-3 shadow-[0_4px_14px_rgba(23,32,51,0.05)]";

const inputClass =
  "w-full rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-[var(--color-primary)]";

function Field({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <div className="mb-1 text-xs font-semibold uppercase text-[var(--color-ink-secondary)]">
        {label}
      </div>
      {children}
    </label>
  );
}

function PanelHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-bold uppercase text-[var(--color-primary)]">
        {eyebrow}
      </p>
      <h2 className="text-sm font-semibold leading-tight">{title}</h2>
    </div>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-[var(--color-page)] px-2.5 py-1.5">
      <span className="mr-2 text-xs font-bold uppercase text-[var(--color-ink-secondary)]">
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function zoneTheme(zoneId: string, zoneName: string): { accent: string } {
  const key = `${zoneId} ${zoneName}`.toLowerCase();
  if (key.includes("trauma")) return { accent: "var(--color-red-solid)" };
  if (key.includes("acute")) return { accent: "var(--color-yellow-solid)" };
  if (key.includes("fast")) return { accent: "var(--color-teal-solid)" };
  if (key.includes("observation")) return { accent: "var(--color-purple-ai)" };
  return { accent: "var(--color-primary)" };
}
