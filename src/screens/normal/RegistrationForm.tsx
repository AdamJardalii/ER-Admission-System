import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileText,
  HeartPulse,
  Landmark,
  MapPin,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  UserPlus,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  addAllergyRecord,
  addClinicalEvent,
  addCondition,
  addInsurancePolicy,
  addMedication,
  addPatientIdentifier,
  addRelatedPerson,
  createCriticalPatient,
  createEncounterForExistingPatient,
  createQuickRegistration,
  completeRegistration,
  updateEncounterField,
  upsertCivilRegistryRecord,
  upsertEmploymentRecord,
  upsertMilitaryRecord,
} from "../../db/repo";
import { useAllPatients, usePatientEncounters } from "../../db/hooks";
import { fuzzyPatientMatches, birthYear } from "../../lib/registration";
import { ALLERGY_OPTIONS, CHIEF_COMPLAINT_OPTIONS, CONDITION_OPTIONS, MEDICATION_OPTIONS } from "../../lib/clinicalCatalog";
import {
  BLOOD_GROUP_OPTIONS,
  COUNTRY_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  INSURANCE_PAYER_OPTIONS,
  LANGUAGE_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  MILITARY_INSTITUTION_OPTIONS,
  NATIONALITY_OPTIONS,
  RELATIONSHIP_OPTIONS,
  TITLE_OPTIONS,
} from "../../lib/registrationCatalog";
import type { AgeBand, ArrivalMethod, Patient, Sex } from "../../types";

const AGE_BANDS: AgeBand[] = ["0-1", "1-5", "5-12", "13-17", "18-30", "31-50", "51-70", "70+"];
const GOVERNORATES = ["Beirut", "Mount Lebanon", "North", "Akkar", "Baalbek-Hermel", "Beqaa", "South", "Nabatieh"];
const NO_KNOWN_ALLERGIES = "No known allergies";
const NO_KNOWN_CONDITIONS = "None known";
const NO_CURRENT_MEDICATIONS = "No current medications";
const REGISTRATION_MEDICATION_OPTIONS = [NO_CURRENT_MEDICATIONS, ...MEDICATION_OPTIONS];

const inputClass = "min-h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-tint)] max-[640px]:min-h-11";

const STEPS = ["Search", "Identity", "Details"] as const;
type Step = 0 | 1 | 2;
type DetailSection =
  | "contact"
  | "clinical"
  | "emergency"
  | "additional-contact"
  | "address"
  | "identity"
  | "birth"
  | "identifiers"
  | "civil-registry"
  | "insurance"
  | "family"
  | "employment";

export function RegistrationForm() {
  const navigate = useNavigate();
  const patients = useAllPatients();
  const [step, setStep] = useState<Step>(0);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [useDob, setUseDob] = useState(false);
  const [openSections, setOpenSections] = useState<Record<DetailSection, boolean>>({
    contact: true,
    clinical: true,
    emergency: true,
    "additional-contact": false,
    address: false,
    identity: false,
    birth: false,
    identifiers: false,
    "civil-registry": false,
    insurance: false,
    family: false,
    employment: false,
  });
  const [form, setForm] = useState({
    patientType: "standard",
    title: "",
    name: "",
    firstNameEn: "",
    middleNameEn: "",
    lastNameEn: "",
    firstNameAr: "",
    middleNameAr: "",
    lastNameAr: "",
    motherNameEn: "",
    motherNameAr: "",
    secondaryMrn: "",
    sex: "unknown" as Sex,
    dob: "",
    ageBand: "18-30" as AgeBand,
    chiefComplaint: [] as string[],
    arrivalMethod: "walk_in" as ArrivalMethod,
    registrationNotes: "",
    phone: "",
    mobileSecondary: "",
    homePhone: "",
    workPhone: "",
    email: "",
    fax: "",
    preferredContactMethod: "mobile",
    nationalId: "",
    passportNumber: "",
    civilCardNumber: "",
    unrwaCardNumber: "",
    rationCardNumber: "",
    nationality: "",
    maritalStatus: "",
    bloodGroup: "",
    addressCountry: "Lebanon",
    governorate: "Beirut",
    district: "",
    addressCity: "",
    addressVillage: "",
    addressZone: "",
    addressArea: "",
    addressStreet: "",
    addressBuilding: "",
    addressFloor: "",
    address: "",
    placeOfBirthCountry: "Lebanon",
    placeOfBirthGovernorate: "",
    placeOfBirthDistrict: "",
    placeOfBirthCity: "",
    civilSijilNumber: "",
    civilSahifaNumber: "",
    civilDaira: "",
    insurancePayerName: "",
    insuranceMembershipNumber: "",
    insurancePolicyNumber: "",
    insuranceExpiryDate: "",
    emergencyName: "",
    emergencyRelation: "",
    emergencyPhone: "",
    spouseName: "",
    spousePhone: "",
    secondaryReferenceName: "",
    secondaryReferencePhone: "",
    occupation: "",
    employmentStatus: "",
    employer: "",
    workAddress: "",
    militaryEnabled: "no",
    militaryInstitution: "",
    militarySection: "",
    militaryRank: "",
    militaryServiceNumber: "",
    militaryZone: "",
    allergies: [] as string[],
    knownConditions: [] as string[],
    currentMedications: [] as string[],
    preferredLanguage: "Arabic",
  });

  const matches = useMemo(
    () => fuzzyPatientMatches(patients, { text: query, phone: query, nationalId: form.nationalId || query, dob: form.dob }),
    [patients, query, form.nationalId, form.dob],
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
      const encounter = await createEncounterForExistingPatient(patient, chiefComplaintText || null);
      navigate(`/patients/${encounter.id}?tab=Triage`);
    } finally {
      setSaving(false);
    }
  }

  const displayName = form.name.trim() || [form.firstNameEn, form.middleNameEn, form.lastNameEn].filter(Boolean).join(" ").trim();
  const chiefComplaintText = form.chiefComplaint.join("; ");
  const selectedAllergies = withoutEmptySelection(form.allergies, NO_KNOWN_ALLERGIES);
  const selectedConditions = withoutEmptySelection(form.knownConditions, NO_KNOWN_CONDITIONS);
  const selectedMedications = withoutEmptySelection(form.currentMedications, NO_CURRENT_MEDICATIONS);
  // Emergency care must not wait for a patient's name. An empty display name is
  // persisted as a synthetic temporary identity by createQuickRegistration.
  const canRegister = form.chiefComplaint.length > 0;
  const contactProvided = Boolean(form.phone || form.mobileSecondary || form.email);
  const clinicalDocumented = Boolean(form.allergies.length || form.knownConditions.length || form.currentMedications.length || form.bloodGroup);
  const emergencyContactProvided = Boolean(form.emergencyName || form.emergencyRelation || form.emergencyPhone);
  const addressProvided = Boolean(
    form.district || form.addressCity || form.addressVillage || form.addressZone || form.addressArea
      || form.addressStreet || form.addressBuilding || form.addressFloor || form.address,
  );
  const identityDetailsProvided = Boolean(
    form.middleNameAr || form.lastNameAr || form.motherNameEn || form.motherNameAr || form.nationality || form.maritalStatus,
  );
  const identifiersProvided = Boolean(
    form.nationalId || form.passportNumber || form.civilCardNumber || form.unrwaCardNumber || form.rationCardNumber || form.secondaryMrn,
  );
  const insuranceProvided = Boolean(
    form.insurancePayerName || form.insuranceMembershipNumber || form.insurancePolicyNumber || form.insuranceExpiryDate,
  );
  const familyDetailsProvided = Boolean(
    form.spouseName || form.spousePhone || form.secondaryReferenceName || form.secondaryReferencePhone,
  );
  const employmentProvided = Boolean(
    form.occupation || form.employmentStatus || form.employer || form.workAddress || form.militaryEnabled === "yes",
  );

  function setSectionOpen(section: DetailSection, open: boolean) {
    setOpenSections((current) => current[section] === open ? current : { ...current, [section]: open });
  }

  function revealSection(section: DetailSection) {
    setSectionOpen(section, true);
    window.requestAnimationFrame(() => {
      document.getElementById(`registration-${section}`)?.scrollIntoView({ block: "start" });
    });
  }

  async function register(full: boolean) {
    if (saving || !canRegister) return;
    setSaving(true);
    try {
      const created = await createQuickRegistration({
        name: displayName,
        sex: form.sex,
        dob: useDob ? form.dob || null : null,
        estimatedAgeRange: useDob ? null : form.ageBand,
        chiefComplaint: chiefComplaintText,
        duplicateOverride: strongMatch,
      });
      await updateEncounterField(created.encounter.id, "arrivalMethod", form.arrivalMethod, "normal");
      if (full) {
        await completeRegistration(created.patient.id, {
          patientType: form.patientType,
          title: form.title || null,
          secondaryMrn: form.secondaryMrn || null,
          firstNameEn: form.firstNameEn || null,
          middleNameEn: form.middleNameEn || null,
          lastNameEn: form.lastNameEn || null,
          firstNameAr: form.firstNameAr || null,
          middleNameAr: form.middleNameAr || null,
          lastNameAr: form.lastNameAr || null,
          motherNameEn: form.motherNameEn || null,
          motherNameAr: form.motherNameAr || null,
          sexAtBirth: form.sex,
          phone: normalizePhone(form.phone) || null,
          mobileSecondary: normalizePhone(form.mobileSecondary) || null,
          homePhone: normalizePhone(form.homePhone) || null,
          workPhone: normalizePhone(form.workPhone) || null,
          fax: normalizePhone(form.fax) || null,
          email: form.email || null,
          preferredContactMethod: form.preferredContactMethod,
          nationalId: form.nationalId || null,
          nationality: form.nationality || null,
          maritalStatus: form.maritalStatus || null,
          bloodGroup: form.bloodGroup || null,
          addressCountry: form.addressCountry || null,
          addressGovernorate: form.governorate || null,
          addressDistrict: form.district || null,
          addressCity: form.addressCity || null,
          addressVillage: form.addressVillage || null,
          addressZone: form.addressZone || null,
          addressArea: form.addressArea || null,
          addressStreet: form.addressStreet || null,
          addressBuilding: form.addressBuilding || null,
          addressFloor: form.addressFloor || null,
          addressAdditionalDetails: form.address || null,
          address: [form.addressCountry, form.governorate, form.district, form.addressCity, form.addressStreet, form.addressBuilding].filter(Boolean).join(" | ") || null,
          city: form.addressCity || form.district || form.governorate,
          placeOfBirthCountry: form.placeOfBirthCountry || null,
          placeOfBirthGovernorate: form.placeOfBirthGovernorate || null,
          placeOfBirthDistrict: form.placeOfBirthDistrict || null,
          placeOfBirthCity: form.placeOfBirthCity || null,
          emergencyContact: [form.emergencyName, form.emergencyRelation, form.emergencyPhone].filter(Boolean).join(" | ") || null,
          emergencyContactName: form.emergencyName || null,
          emergencyContactRelationship: form.emergencyRelation || null,
          emergencyContactPhone: normalizePhone(form.emergencyPhone) || null,
          knownConditions: selectedConditions,
          currentMedications: selectedMedications,
          preferredLanguage: form.preferredLanguage,
        }, created.encounter.id, "normal");
        await persistOptionalProfile(created.patient.id);
        await persistClinicalBackground(created.patient.id, created.encounter.id);
      }
      if (form.registrationNotes.trim()) {
        await addClinicalEvent(created.encounter.id, "note", { text: form.registrationNotes.trim(), actor: "Registrar", registrationNote: true }, null);
      }
      navigate(`/patients/${created.encounter.id}?tab=Triage`);
    } finally {
      setSaving(false);
    }
  }

  async function persistOptionalProfile(patientId: string) {
    if (form.nationalId) await addPatientIdentifier({ patientId, type: "national_id", value: form.nationalId, issuingCountry: form.addressCountry || null, isPrimary: true }, "normal");
    if (form.passportNumber) await addPatientIdentifier({ patientId, type: "passport", value: form.passportNumber, issuingCountry: form.nationality || form.addressCountry || null, isPrimary: false }, "normal");
    if (form.civilCardNumber) await addPatientIdentifier({ patientId, type: "civil_card", value: form.civilCardNumber, issuingCountry: form.addressCountry || null, isPrimary: false }, "normal");
    if (form.unrwaCardNumber) await addPatientIdentifier({ patientId, type: "unrwa_card", value: form.unrwaCardNumber, issuingCountry: form.addressCountry || null, isPrimary: false }, "normal");
    if (form.rationCardNumber) await addPatientIdentifier({ patientId, type: "ration_card", value: form.rationCardNumber, issuingCountry: form.addressCountry || null, isPrimary: false }, "normal");
    if (form.insurancePayerName) {
      await addInsurancePolicy({
        patientId,
        payerId: "INS-MOCK-REG",
        payerName: form.insurancePayerName,
        plan: null,
        membershipNumber: form.insuranceMembershipNumber || null,
        policyNumber: form.insurancePolicyNumber || null,
        coverageClass: null,
        subscriberRelationship: null,
        subscriberName: null,
        subscriberId: null,
        effectiveDate: null,
        expiryDate: form.insuranceExpiryDate || null,
        isDefault: true,
        approvalRequired: false,
        notes: null,
        cardImageBlob: null,
      }, "normal");
    }
    if (form.civilSijilNumber || form.civilSahifaNumber || form.civilDaira) {
      await upsertCivilRegistryRecord(patientId, {
        sijilNumber: form.civilSijilNumber || null,
        sahifaNumber: form.civilSahifaNumber || null,
        daira: form.civilDaira || null,
        registryCountry: form.addressCountry || null,
        registryGovernorate: form.governorate || null,
        registryDistrict: form.district || null,
      }, "normal");
    }
    if (form.occupation || form.employmentStatus || form.employer || form.workAddress) {
      await upsertEmploymentRecord(patientId, {
        occupation: form.occupation || null,
        employmentStatus: form.employmentStatus || null,
        employer: form.employer || null,
        workPhone: normalizePhone(form.workPhone) || null,
        workAddress: form.workAddress || null,
      }, "normal");
    }
    if (form.militaryEnabled === "yes") {
      await upsertMilitaryRecord(patientId, {
        enabled: true,
        institution: form.militaryInstitution || null,
        section: form.militarySection || null,
        positionOrRank: form.militaryRank || null,
        serviceNumber: form.militaryServiceNumber || null,
        zone: form.militaryZone || null,
      }, "normal");
    }
    const contacts = [
      { name: form.emergencyName, relationship: form.emergencyRelation, phone: form.emergencyPhone, role: "next_of_kin" },
      { name: form.spouseName, relationship: "spouse", phone: form.spousePhone, role: "spouse" },
      { name: form.secondaryReferenceName, relationship: "reference", phone: form.secondaryReferencePhone, role: "secondary" },
    ];
    for (const contact of contacts.filter((c) => c.name || c.phone)) {
      await addRelatedPerson({
        patientId,
        fullName: contact.name || "Unnamed contact",
        englishName: null,
        arabicName: null,
        relationship: contact.relationship || null,
        mobilePrimary: normalizePhone(contact.phone) || null,
        mobileSecondary: null,
        email: null,
        address: null,
        nationalId: null,
        isEmergencyContact: contact.role !== "secondary",
        isNextOfKin: contact.role === "next_of_kin",
        isSpouse: contact.role === "spouse",
        isParent: false,
        isLegalGuardian: false,
        isAuthorizedRepresentative: false,
        preferredContactMethod: "mobile",
        contactPriority: contact.role === "next_of_kin" ? 1 : contact.role === "spouse" ? 2 : 3,
        notes: null,
      }, "normal");
    }
  }

  async function persistClinicalBackground(patientId: string, encounterId: string) {
    for (const substance of selectedAllergies) {
      await addAllergyRecord({
        encounterId,
        patientId,
        substance,
        reaction: null,
        severity: "moderate",
        status: "active",
        actor: "Registrar",
      }, "normal");
    }
    for (const name of selectedConditions) {
      await addCondition({
        patientId,
        encounterId,
        name,
        category: null,
        onsetDate: null,
        status: "active",
        notes: "Recorded during registration",
      }, "normal");
    }
    for (const name of selectedMedications) {
      await addMedication({
        patientId,
        encounterId,
        name,
        dose: null,
        route: null,
        frequency: null,
        status: "active",
        startedAt: null,
        stoppedAt: null,
        prescriber: null,
        notes: "Recorded during registration",
      }, "normal");
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
    <div className="registration-page">
      <header className="registration-header">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Cancel new patient registration"
            title="Back"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] max-[560px]:h-11 max-[560px]:w-11"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="mr-auto min-w-[180px] max-[560px]:min-w-0 max-[560px]:flex-1">
            <h1 className="text-lg font-semibold">New patient</h1>
            <p className="mt-0.5 text-xs text-[var(--color-ink-secondary)]">
              Step {step + 1} of {STEPS.length}{step === 2 ? " | Optional details" : step === 1 ? " | Identity and complaint" : " | Search existing records"}
            </p>
          </div>
          <span id="critical-path-description" className="sr-only">Create the minimum emergency record and continue directly to treatment.</span>
          <button
            type="button"
            onClick={() => void criticalFastPath()}
            disabled={saving}
            aria-describedby="critical-path-description"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--color-red-solid)] bg-[var(--color-red-solid)] px-3 text-sm font-semibold text-white hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-red-solid)] disabled:opacity-50 max-[560px]:min-h-11 max-[560px]:px-2"
          >
            <AlertTriangle size={16} /> Critical: treat now
          </button>
        </div>
        <ol className="registration-progress" aria-label="Registration progress">
          {STEPS.map((label, index) => (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => index <= step && setStep(index as Step)}
                disabled={index > step}
                aria-current={index === step ? "step" : undefined}
                className={`registration-progress-step ${
                  index === step
                    ? "bg-[var(--color-primary)] text-white"
                    : index < step
                      ? "bg-[var(--color-primary-tint)] text-[var(--color-primary)]"
                      : "text-[var(--color-ink-secondary)]"
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-xs" aria-hidden="true">
                  {index < step ? <Check size={13} /> : index + 1}
                </span>
                {label}
              </button>
              {index < STEPS.length - 1 && <ArrowRight size={14} className="shrink-0 text-[var(--color-border-strong)]" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </header>

      {/* Step 1 — Search */}
      {step === 0 && (
        <section className="card space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Search for an existing record first</h2>
            <p className="text-xs text-[var(--color-ink-secondary)]">Avoid duplicates — check by name, phone, MRN, national ID, or catastrophe tag.</p>
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-2.5 text-[var(--color-ink-secondary)]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Karim Salem, 410111, MRN-100001, #B-2999" className={`${inputClass} pl-8`} autoFocus />
          </div>

          {query.trim() && matches.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2">
              {matches.map((match) => (
                <CandidateCard key={match.patient.id} patient={match.patient} reasons={match.reasons} strong={match.strong} onOpen={() => void openExisting(match.patient)} />
              ))}
            </div>
          )}
          {query.trim() && matches.length === 0 && (
            <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-ink-secondary)]">No existing patient matches — register a new one below.</p>
          )}

          <div className="flex justify-end border-t border-[var(--color-border)] pt-3">
            <button
              type="button"
              onClick={() => {
                setForm((current) => ({ ...current, name: current.name || (matches.length === 0 ? query : "") }));
                setStep(1);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3.5 py-2 text-sm font-semibold text-white"
            >
              <UserPlus size={16} /> None of these — register new <ArrowRight size={15} />
            </button>
          </div>
        </section>
      )}

      {/* Step 2 — Identity & complaint */}
      {step === 1 && (
        <section className="card space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Who is the patient, and why are they here?</h2>
            <p className="text-xs text-[var(--color-ink-secondary)]">Chief complaint is required. Name, full identity, and insurance can be completed after triage.</p>
          </div>
          <div className="grid grid-cols-4 gap-2 max-[720px]:grid-cols-2 max-[440px]:grid-cols-1">
            <Field label="Patient type">
              <select value={form.patientType} onChange={(e) => update("patientType", e.target.value)} className={inputClass}>
                <option value="standard">Standard</option>
                <option value="unknown">Unknown / temporary</option>
                <option value="trauma">Trauma</option>
                <option value="visitor">Visitor</option>
                <option value="staff">Staff</option>
              </select>
            </Field>
            <Field label="Title">
              <select value={form.title} onChange={(e) => update("title", e.target.value)} className={inputClass}>
                <option value="">Select title</option>
                {TITLE_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select>
            </Field>
            <Field
              label={
                <span className="flex items-center justify-between gap-2">
                  <span>Display name</span>
                  <button
                    type="button"
                    aria-pressed={form.patientType === "unknown" && !displayName}
                    onClick={() => setForm((current) => ({
                      ...current,
                      patientType: "unknown",
                      name: "",
                      firstNameEn: "",
                      middleNameEn: "",
                      lastNameEn: "",
                      firstNameAr: "",
                    }))}
                    className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[var(--color-primary)] px-2 text-[11px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-tint)]"
                  >
                    <UserRound size={13} /> Unknown patient
                  </button>
                </span>
              }
              className="col-span-2 max-[440px]:col-span-1"
            >
              <input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Leave blank for unknown / temporary identity" className={inputClass} autoFocus />
            </Field>
            <Field label="First name EN"><input value={form.firstNameEn} onChange={(e) => update("firstNameEn", e.target.value)} className={inputClass} /></Field>
            <Field label="Middle name EN"><input value={form.middleNameEn} onChange={(e) => update("middleNameEn", e.target.value)} className={inputClass} /></Field>
            <Field label="Last name EN"><input value={form.lastNameEn} onChange={(e) => update("lastNameEn", e.target.value)} className={inputClass} /></Field>
            <Field label="First name AR"><input value={form.firstNameAr} onChange={(e) => update("firstNameAr", e.target.value)} className={inputClass} /></Field>
            <Field label="Sex" required>
              <select value={form.sex} onChange={(e) => update("sex", e.target.value as Sex)} className={inputClass}>
                <option value="unknown">Unknown</option>
                <option value="male">M</option>
                <option value="female">F</option>
              </select>
            </Field>
            <Field label={
              <span className="flex items-center justify-between gap-1">
                <span>Age<span className="ml-0.5 text-[var(--color-red-solid)]">*</span></span>
                <button type="button" onClick={() => setUseDob((v) => !v)} className="text-xs font-semibold text-[var(--color-primary)]">
                  {useDob ? "use band" : "use DOB"}
                </button>
              </span>
            }>
              {useDob ? (
                <input type="date" value={form.dob} onChange={(e) => update("dob", e.target.value)} className={inputClass} />
              ) : (
                <select value={form.ageBand} onChange={(e) => update("ageBand", e.target.value as AgeBand)} className={inputClass}>
                  {AGE_BANDS.map((band) => <option key={band}>{band}</option>)}
                </select>
              )}
            </Field>
            <CatalogMultiSelectField
              label="Chief complaint"
              required
              values={form.chiefComplaint}
              options={CHIEF_COMPLAINT_OPTIONS}
              onChange={(values) => update("chiefComplaint", values)}
              placeholder="Select one or more complaints"
              className="col-span-4 max-[720px]:col-span-2 max-[440px]:col-span-1"
            />
            <Field label="Arrival mode">
              <select value={form.arrivalMethod} onChange={(e) => update("arrivalMethod", e.target.value as ArrivalMethod)} className={inputClass}>
                <option value="walk_in">Walk in</option>
                <option value="ambulance">Ambulance</option>
                <option value="transfer">Transfer</option>
                <option value="police">Police</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Registration notes" className="col-span-3 max-[720px]:col-span-1">
              <input value={form.registrationNotes} onChange={(e) => update("registrationNotes", e.target.value)} placeholder="Identity pending, family will bring documents..." className={inputClass} />
            </Field>
          </div>
          {!displayName && (
            <p className="rounded-md bg-[var(--color-primary-tint)] px-3 py-2 text-xs text-[var(--color-primary)]">
              No name entered. The system will create a temporary identity and take the patient directly to triage.
            </p>
          )}
          {strongMatch && (
            <p className="rounded-md bg-[var(--color-yellow-tint)] px-3 py-2 text-xs font-semibold text-[var(--color-yellow-text)]">
              A strong duplicate match exists — creating a new record will be audited as an override.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3">
            <button type="button" onClick={() => setStep(0)} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold">
              <ArrowLeft size={15} /> Back
            </button>
            <div className="flex gap-2">
              <button type="button" disabled={saving || !canRegister} onClick={() => void register(false)} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold disabled:opacity-50">
                {saving ? "Saving…" : "Quick register"}
              </button>
              <button type="button" disabled={!canRegister} onClick={() => setStep(2)} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Add details <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Step 3 — Optional details */}
      {step === 2 && (
        <section className="registration-details-step" aria-labelledby="registration-details-title">
          <div className="registration-details-layout">
            <div className="registration-form-surface">
              <div className="registration-details-intro">
                <div>
                  <h2 id="registration-details-title" className="text-base font-semibold">Optional patient details</h2>
                  <p className="mt-1 text-sm text-[var(--color-ink-secondary)]">Add useful information now, or complete it later from the patient chart.</p>
                </div>
                <div className="min-w-0 text-sm max-[720px]:w-full">
                  <div className="truncate font-semibold">{displayName}</div>
                  <div className="truncate text-xs capitalize text-[var(--color-ink-secondary)]">
                    {form.sex} | {useDob && form.dob ? form.dob : `Age ${form.ageBand}`} | {chiefComplaintText}
                  </div>
                </div>
              </div>

              <DisclosureSection
                section="contact"
                title="Contact and communication"
                summary={contactProvided ? [form.phone, form.email, form.preferredLanguage].filter(Boolean).join(" | ") : `Preferred language: ${form.preferredLanguage}`}
                icon={Phone}
                open={openSections.contact}
                onToggle={(open) => setSectionOpen("contact", open)}
                priority
              >
                <div className="registration-quick-grid">
                  <Field label="Primary mobile"><input value={form.phone} onChange={(e) => update("phone", e.target.value)} className={inputClass} /></Field>
                  <Field label="Secondary mobile"><input value={form.mobileSecondary} onChange={(e) => update("mobileSecondary", e.target.value)} className={inputClass} /></Field>
                  <Field label="Email"><input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} className={inputClass} /></Field>
                  <Field label="Preferred contact"><select value={form.preferredContactMethod} onChange={(e) => update("preferredContactMethod", e.target.value)} className={inputClass}><option value="mobile">Mobile</option><option value="home_phone">Home phone</option><option value="work_phone">Work phone</option><option value="email">Email</option><option value="none">None</option></select></Field>
                  <Field label="Preferred language"><select value={form.preferredLanguage} onChange={(e) => update("preferredLanguage", e.target.value)} className={inputClass}>{LANGUAGE_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></Field>
                </div>
              </DisclosureSection>

              <DisclosureSection
                section="clinical"
                title="Essential clinical background"
                summary={clinicalDocumented ? "Clinical history documented" : "Allergies, conditions, medications, and blood group"}
                icon={HeartPulse}
                open={openSections.clinical}
                onToggle={(open) => setSectionOpen("clinical", open)}
                priority
              >
                <div className="registration-quick-grid">
                  <CatalogMultiSelectField
                    label="Allergies"
                    values={form.allergies}
                    options={ALLERGY_OPTIONS}
                    exclusiveValues={[NO_KNOWN_ALLERGIES]}
                    onChange={(values) => update("allergies", values)}
                    placeholder="Select allergies"
                  />
                  <CatalogMultiSelectField
                    label="Known conditions"
                    values={form.knownConditions}
                    options={CONDITION_OPTIONS}
                    exclusiveValues={[NO_KNOWN_CONDITIONS]}
                    onChange={(values) => update("knownConditions", values)}
                    placeholder="Select conditions"
                  />
                  <Field label="Blood group"><select value={form.bloodGroup} onChange={(e) => update("bloodGroup", e.target.value)} className={inputClass}><option value="">Select blood group</option>{BLOOD_GROUP_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></Field>
                  <CatalogMultiSelectField
                    label="Current medications"
                    values={form.currentMedications}
                    options={REGISTRATION_MEDICATION_OPTIONS}
                    exclusiveValues={[NO_CURRENT_MEDICATIONS]}
                    onChange={(values) => update("currentMedications", values)}
                    placeholder="Select medications"
                    className="registration-field-span-2"
                  />
                </div>
              </DisclosureSection>

              <DisclosureSection
                section="emergency"
                title="Emergency contact"
                summary={[form.emergencyName, form.emergencyRelation, form.emergencyPhone].filter(Boolean).join(" | ") || "Add next of kin or emergency contact"}
                icon={UserRound}
                open={openSections.emergency}
                onToggle={(open) => setSectionOpen("emergency", open)}
                priority
              >
                <div className="registration-quick-grid">
                  <Field label="Full name"><input value={form.emergencyName} onChange={(e) => update("emergencyName", e.target.value)} className={inputClass} /></Field>
                  <Field label="Relationship"><select value={form.emergencyRelation} onChange={(e) => update("emergencyRelation", e.target.value)} className={inputClass}><option value="">Select relationship</option>{RELATIONSHIP_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></Field>
                  <Field label="Primary phone"><input value={form.emergencyPhone} onChange={(e) => update("emergencyPhone", e.target.value)} className={inputClass} /></Field>
                </div>
              </DisclosureSection>

              <div className="registration-advanced-heading">
                <div>
                  <h3 className="text-sm font-semibold">Additional information</h3>
                  <p className="text-xs text-[var(--color-ink-secondary)]">Open only the sections needed for this visit.</p>
                </div>
                <span className="text-xs font-medium text-[var(--color-ink-secondary)]">Available later in the patient chart</span>
              </div>

              <div className="registration-disclosure-grid">
                <DisclosureSection
                  section="additional-contact"
                  title="Additional contact channels"
                  summary={[form.homePhone, form.workPhone, form.fax].filter(Boolean).join(" | ") || "Not provided"}
                  icon={Phone}
                  open={openSections["additional-contact"]}
                  onToggle={(open) => setSectionOpen("additional-contact", open)}
                >
                  <div className="registration-field-grid">
                    <Field label="Home phone"><input value={form.homePhone} onChange={(e) => update("homePhone", e.target.value)} className={inputClass} /></Field>
                    <Field label="Work phone"><input value={form.workPhone} onChange={(e) => update("workPhone", e.target.value)} className={inputClass} /></Field>
                    <Field label="Fax"><input value={form.fax} onChange={(e) => update("fax", e.target.value)} className={inputClass} /></Field>
                  </div>
                </DisclosureSection>

                <DisclosureSection
                  section="address"
                  title="Address"
                  summary={[form.addressCountry, form.governorate, form.addressCity].filter(Boolean).join(" | ")}
                  icon={MapPin}
                  open={openSections.address}
                  onToggle={(open) => setSectionOpen("address", open)}
                >
                  <div className="registration-address-grid">
                    <Field label="Country"><select value={form.addressCountry} onChange={(e) => update("addressCountry", e.target.value)} className={inputClass}>{COUNTRY_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></Field>
                    <Field label="Governorate"><select value={form.governorate} onChange={(e) => update("governorate", e.target.value)} className={inputClass}>{GOVERNORATES.map((name) => <option key={name}>{name}</option>)}</select></Field>
                    <Field label="District"><input value={form.district} onChange={(e) => update("district", e.target.value)} className={inputClass} /></Field>
                    <Field label="City / town"><input value={form.addressCity} onChange={(e) => update("addressCity", e.target.value)} className={inputClass} /></Field>
                    <Field label="Village"><input value={form.addressVillage} onChange={(e) => update("addressVillage", e.target.value)} className={inputClass} /></Field>
                    <Field label="Zone / neighborhood"><input value={form.addressZone} onChange={(e) => update("addressZone", e.target.value)} className={inputClass} /></Field>
                    <Field label="Area"><input value={form.addressArea} onChange={(e) => update("addressArea", e.target.value)} className={inputClass} /></Field>
                    <Field label="Street"><input value={form.addressStreet} onChange={(e) => update("addressStreet", e.target.value)} className={inputClass} /></Field>
                    <Field label="Building"><input value={form.addressBuilding} onChange={(e) => update("addressBuilding", e.target.value)} className={inputClass} /></Field>
                    <Field label="Floor"><input value={form.addressFloor} onChange={(e) => update("addressFloor", e.target.value)} className={inputClass} /></Field>
                    <Field label="Additional directions" className="registration-field-span-full"><input value={form.address} onChange={(e) => update("address", e.target.value)} className={inputClass} /></Field>
                  </div>
                </DisclosureSection>

                <DisclosureSection
                  section="identity"
                  title="Additional identity"
                  summary={[form.nationality, form.maritalStatus].filter(Boolean).join(" | ") || "Not provided"}
                  icon={UserRound}
                  open={openSections.identity}
                  onToggle={(open) => setSectionOpen("identity", open)}
                >
                  <div className="registration-field-grid">
                    <Field label="Middle name AR"><input value={form.middleNameAr} onChange={(e) => update("middleNameAr", e.target.value)} className={inputClass} /></Field>
                    <Field label="Last name AR"><input value={form.lastNameAr} onChange={(e) => update("lastNameAr", e.target.value)} className={inputClass} /></Field>
                    <Field label="Mother name EN"><input value={form.motherNameEn} onChange={(e) => update("motherNameEn", e.target.value)} className={inputClass} /></Field>
                    <Field label="Mother name AR"><input value={form.motherNameAr} onChange={(e) => update("motherNameAr", e.target.value)} className={inputClass} /></Field>
                    <Field label="Nationality"><select value={form.nationality} onChange={(e) => update("nationality", e.target.value)} className={inputClass}><option value="">Select nationality</option>{NATIONALITY_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></Field>
                    <Field label="Marital status"><select value={form.maritalStatus} onChange={(e) => update("maritalStatus", e.target.value)} className={inputClass}><option value="">Select status</option>{MARITAL_STATUS_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></Field>
                  </div>
                </DisclosureSection>

                <DisclosureSection
                  section="birth"
                  title="Place of birth"
                  summary={[form.placeOfBirthCountry, form.placeOfBirthGovernorate, form.placeOfBirthCity].filter(Boolean).join(" | ") || "Not provided"}
                  icon={MapPin}
                  open={openSections.birth}
                  onToggle={(open) => setSectionOpen("birth", open)}
                >
                  <div className="registration-address-grid">
                    <Field label="Birth country"><select value={form.placeOfBirthCountry} onChange={(e) => update("placeOfBirthCountry", e.target.value)} className={inputClass}>{COUNTRY_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></Field>
                    <Field label="Birth governorate"><input value={form.placeOfBirthGovernorate} onChange={(e) => update("placeOfBirthGovernorate", e.target.value)} className={inputClass} /></Field>
                    <Field label="Birth district"><input value={form.placeOfBirthDistrict} onChange={(e) => update("placeOfBirthDistrict", e.target.value)} className={inputClass} /></Field>
                    <Field label="Birth city"><input value={form.placeOfBirthCity} onChange={(e) => update("placeOfBirthCity", e.target.value)} className={inputClass} /></Field>
                  </div>
                </DisclosureSection>

                <DisclosureSection
                  section="identifiers"
                  title="Identifiers"
                  summary={form.nationalId ? `National ID ${maskIdentifier(form.nationalId)}` : identifiersProvided ? "Identifiers added" : "Not provided"}
                  icon={FileText}
                  open={openSections.identifiers}
                  onToggle={(open) => setSectionOpen("identifiers", open)}
                >
                  <div className="registration-field-grid">
                    <Field label="National ID"><input value={form.nationalId} onChange={(e) => update("nationalId", e.target.value)} className={inputClass} />{nationalIdMatch && <span className="mt-1 block text-xs font-semibold text-[var(--color-red-solid)]">Matches {nationalIdMatch.name ?? nationalIdMatch.mrn}</span>}</Field>
                    <Field label="Passport number"><input value={form.passportNumber} onChange={(e) => update("passportNumber", e.target.value)} className={inputClass} /></Field>
                    <Field label="Civil card number"><input value={form.civilCardNumber} onChange={(e) => update("civilCardNumber", e.target.value)} className={inputClass} /></Field>
                    <Field label="UNRWA card number"><input value={form.unrwaCardNumber} onChange={(e) => update("unrwaCardNumber", e.target.value)} className={inputClass} /></Field>
                    <Field label="Ration / stamp card"><input value={form.rationCardNumber} onChange={(e) => update("rationCardNumber", e.target.value)} className={inputClass} /></Field>
                    <Field label="Secondary MRN"><input value={form.secondaryMrn} onChange={(e) => update("secondaryMrn", e.target.value)} className={inputClass} /></Field>
                  </div>
                </DisclosureSection>

                <DisclosureSection
                  section="civil-registry"
                  title="Civil registry"
                  summary={[form.civilSijilNumber, form.civilSahifaNumber, form.civilDaira].filter(Boolean).length ? "Registry details added" : "Not provided"}
                  icon={Landmark}
                  open={openSections["civil-registry"]}
                  onToggle={(open) => setSectionOpen("civil-registry", open)}
                >
                  <div className="registration-field-grid">
                    <Field label="Sijil / رقم السجل"><input value={form.civilSijilNumber} onChange={(e) => update("civilSijilNumber", e.target.value)} className={inputClass} /></Field>
                    <Field label="Sahifa / رقم الصحيفة"><input value={form.civilSahifaNumber} onChange={(e) => update("civilSahifaNumber", e.target.value)} className={inputClass} /></Field>
                    <Field label="Daira / الدائرة"><input value={form.civilDaira} onChange={(e) => update("civilDaira", e.target.value)} className={inputClass} /></Field>
                  </div>
                </DisclosureSection>

                <DisclosureSection
                  section="insurance"
                  title="Insurance"
                  summary={form.insurancePayerName ? `${form.insurancePayerName}${form.insuranceMembershipNumber ? ` | Membership ${form.insuranceMembershipNumber}` : ""}` : "Not provided - emergency registration does not require insurance"}
                  icon={ShieldCheck}
                  open={openSections.insurance}
                  onToggle={(open) => setSectionOpen("insurance", open)}
                >
                  <div className="registration-field-grid">
                    <Field label="Insurance payer"><select value={form.insurancePayerName} onChange={(e) => update("insurancePayerName", e.target.value)} className={inputClass}><option value="">Select payer</option>{INSURANCE_PAYER_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></Field>
                    <Field label="Membership number"><input value={form.insuranceMembershipNumber} onChange={(e) => update("insuranceMembershipNumber", e.target.value)} className={inputClass} /></Field>
                    <Field label="Policy number"><input value={form.insurancePolicyNumber} onChange={(e) => update("insurancePolicyNumber", e.target.value)} className={inputClass} /></Field>
                    <Field label="Policy expiry"><input type="date" value={form.insuranceExpiryDate} onChange={(e) => update("insuranceExpiryDate", e.target.value)} className={inputClass} /></Field>
                  </div>
                </DisclosureSection>

                <DisclosureSection
                  section="family"
                  title="Family and references"
                  summary={[form.spouseName, form.secondaryReferenceName].filter(Boolean).join(" | ") || "Not provided"}
                  icon={UserRound}
                  open={openSections.family}
                  onToggle={(open) => setSectionOpen("family", open)}
                >
                  <div className="registration-field-grid">
                    <Field label="Spouse"><input value={form.spouseName} onChange={(e) => update("spouseName", e.target.value)} className={inputClass} /></Field>
                    <Field label="Spouse phone"><input value={form.spousePhone} onChange={(e) => update("spousePhone", e.target.value)} className={inputClass} /></Field>
                    <Field label="Secondary reference"><input value={form.secondaryReferenceName} onChange={(e) => update("secondaryReferenceName", e.target.value)} className={inputClass} /></Field>
                    <Field label="Reference phone"><input value={form.secondaryReferencePhone} onChange={(e) => update("secondaryReferencePhone", e.target.value)} className={inputClass} /></Field>
                  </div>
                </DisclosureSection>

                <DisclosureSection
                  section="employment"
                  title="Employment and sensitive information"
                  summary={[form.employmentStatus, form.employer, form.militaryEnabled === "yes" ? "Military/security" : ""].filter(Boolean).join(" | ") || "Not provided"}
                  icon={Briefcase}
                  open={openSections.employment}
                  onToggle={(open) => setSectionOpen("employment", open)}
                >
                  <div className="registration-field-grid">
                    <Field label="Occupation"><input value={form.occupation} onChange={(e) => update("occupation", e.target.value)} className={inputClass} /></Field>
                    <Field label="Employment status"><select value={form.employmentStatus} onChange={(e) => update("employmentStatus", e.target.value)} className={inputClass}><option value="">Select status</option>{EMPLOYMENT_STATUS_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></Field>
                    <Field label="Employer"><input value={form.employer} onChange={(e) => update("employer", e.target.value)} className={inputClass} /></Field>
                    <Field label="Work address"><input value={form.workAddress} onChange={(e) => update("workAddress", e.target.value)} className={inputClass} /></Field>
                  </div>
                  <div className="registration-sensitive-subsection">
                    <div>
                      <h4 className="text-sm font-semibold">Military / security</h4>
                      <p className="text-xs text-[var(--color-ink-secondary)]">Sensitive fields appear only when applicable.</p>
                    </div>
                    <div className="registration-field-grid">
                      <Field label="Applicable"><select value={form.militaryEnabled} onChange={(e) => update("militaryEnabled", e.target.value)} className={inputClass}><option value="no">No</option><option value="yes">Yes</option></select></Field>
                      {form.militaryEnabled === "yes" && (
                        <>
                          <Field label="Institution"><select value={form.militaryInstitution} onChange={(e) => update("militaryInstitution", e.target.value)} className={inputClass}><option value="">Select institution</option>{MILITARY_INSTITUTION_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></Field>
                          <Field label="Section"><input value={form.militarySection} onChange={(e) => update("militarySection", e.target.value)} className={inputClass} /></Field>
                          <Field label="Position / rank"><input value={form.militaryRank} onChange={(e) => update("militaryRank", e.target.value)} className={inputClass} /></Field>
                          <Field label="Service number"><input value={form.militaryServiceNumber} onChange={(e) => update("militaryServiceNumber", e.target.value)} className={inputClass} /></Field>
                          <Field label="Military zone"><input value={form.militaryZone} onChange={(e) => update("militaryZone", e.target.value)} className={inputClass} /></Field>
                        </>
                      )}
                    </div>
                  </div>
                </DisclosureSection>
              </div>
            </div>

            <aside className="registration-summary" aria-labelledby="registration-summary-title">
              <div className="border-b border-[var(--color-border)] px-3 py-3">
                <div className="flex items-center gap-2">
                  <ClipboardList size={17} className="text-[var(--color-primary)]" />
                  <h2 id="registration-summary-title" className="text-sm font-semibold">Registration summary</h2>
                </div>
                <p className="mt-1 text-xs text-[var(--color-ink-secondary)]">Optional information can be completed later.</p>
              </div>
              <div className="p-2">
                <RegistrationSummaryRow label="Identity" status="Complete" complete onClick={() => setStep(1)} />
                <RegistrationSummaryRow label="Primary phone" status={form.phone ? "Complete" : "Not provided"} complete={Boolean(form.phone)} onClick={() => revealSection("contact")} />
                <RegistrationSummaryRow label="Clinical background" status={clinicalDocumented ? "Added" : "Optional"} complete={clinicalDocumented} onClick={() => revealSection("clinical")} />
                <RegistrationSummaryRow label="Emergency contact" status={emergencyContactProvided ? "Added" : "Optional"} complete={emergencyContactProvided} onClick={() => revealSection("emergency")} />
                <RegistrationSummaryRow label="Address" status={addressProvided ? "Added" : "Not provided"} complete={addressProvided} onClick={() => revealSection("address")} />
                <RegistrationSummaryRow label="Additional identity" status={identityDetailsProvided ? "Added" : "Optional"} complete={identityDetailsProvided} onClick={() => revealSection("identity")} />
                <RegistrationSummaryRow label="Identifiers" status={identifiersProvided ? "Added" : "Not provided"} complete={identifiersProvided} onClick={() => revealSection("identifiers")} />
                <RegistrationSummaryRow label="Insurance" status={insuranceProvided ? "Added" : "Not provided"} complete={insuranceProvided} onClick={() => revealSection("insurance")} />
                <RegistrationSummaryRow label="Family / references" status={familyDetailsProvided ? "Added" : "Optional"} complete={familyDetailsProvided} onClick={() => revealSection("family")} />
                <RegistrationSummaryRow label="Employment / sensitive" status={employmentProvided ? "Added" : "Optional"} complete={employmentProvided} onClick={() => revealSection("employment")} />
              </div>
              <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-ink-secondary)]">
                Missing optional details will not block registration.
              </div>
            </aside>
          </div>

          <div className="registration-actions">
            <button type="button" onClick={() => setStep(1)} className="registration-action-back">
              <ArrowLeft size={16} /> Back
            </button>
            <p className="registration-action-help">These details are optional and may be completed later from the patient chart.</p>
            <div className="registration-action-buttons">
              <button type="button" disabled={saving || !canRegister} onClick={() => void register(false)} className="registration-action-secondary">
                Skip optional details
              </button>
              <button type="button" disabled={saving || !canRegister} onClick={() => void register(true)} className="registration-action-primary">
                <Check size={16} /> {saving ? "Saving..." : "Finish & register"}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function DisclosureSection({
  section,
  title,
  summary,
  icon: Icon,
  open,
  onToggle,
  priority = false,
  children,
}: {
  section: DetailSection;
  title: string;
  summary: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: (open: boolean) => void;
  priority?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      id={`registration-${section}`}
      open={open}
      onToggle={(event) => onToggle(event.currentTarget.open)}
      className={`registration-disclosure ${priority ? "registration-disclosure-priority" : ""}`}
    >
      <summary className="registration-disclosure-summary" aria-expanded={open}>
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-primary-tint)] text-[var(--color-primary)]" aria-hidden="true">
          <Icon size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block truncate text-xs font-normal text-[var(--color-ink-secondary)]">{summary}</span>
        </span>
        <ChevronDown size={17} className="registration-disclosure-chevron shrink-0 text-[var(--color-ink-secondary)]" aria-hidden="true" />
      </summary>
      <div className="registration-disclosure-content">{children}</div>
    </details>
  );
}

function RegistrationSummaryRow({
  label,
  status,
  complete,
  onClick,
}: {
  label: string;
  status: string;
  complete: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="registration-summary-row">
      <span className="inline-flex min-w-0 items-center gap-2">
        {complete ? (
          <CheckCircle2 size={15} className="shrink-0 text-[var(--color-green-text)]" aria-hidden="true" />
        ) : (
          <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-[var(--color-border-strong)]" aria-hidden="true" />
        )}
        <span className="truncate text-sm font-medium">{label}</span>
      </span>
      <span className={`shrink-0 text-xs font-semibold ${complete ? "text-[var(--color-green-text)]" : "text-[var(--color-ink-secondary)]"}`}>{status}</span>
    </button>
  );
}

function CatalogMultiSelectField({
  label,
  required = false,
  values,
  options,
  exclusiveValues = [],
  onChange,
  placeholder,
  className = "",
}: {
  label: string;
  required?: boolean;
  values: string[];
  options: string[];
  exclusiveValues?: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  className?: string;
}) {
  const labelId = useId();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = options.filter((option) => !normalizedQuery || option.toLowerCase().includes(normalizedQuery));
  const customValue = query.trim();
  const canAddCustom = customValue.length > 0
    && !options.some((option) => option.toLowerCase() === normalizedQuery)
    && !values.some((value) => value.toLowerCase() === normalizedQuery);
  const menuItemCount = filteredOptions.length + (canAddCustom ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  function isSelected(value: string) {
    return values.some((selected) => selected.toLowerCase() === value.toLowerCase());
  }

  function toggleValue(value: string) {
    if (isSelected(value)) {
      onChange(values.filter((selected) => selected.toLowerCase() !== value.toLowerCase()));
    } else if (exclusiveValues.some((exclusive) => exclusive.toLowerCase() === value.toLowerCase())) {
      onChange([value]);
    } else {
      const withoutExclusiveValues = values.filter(
        (selected) => !exclusiveValues.some((exclusive) => exclusive.toLowerCase() === selected.toLowerCase()),
      );
      onChange([...withoutExclusiveValues, value]);
    }
    setQuery("");
    setHighlightedIndex(0);
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <span id={labelId} className="mb-1 block text-xs font-semibold text-[var(--color-ink-secondary)]">
        {label}
        {required && <span className="ml-0.5 text-[var(--color-red-solid)]">*</span>}
      </span>
      <button
        type="button"
        aria-labelledby={labelId}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-required={required}
        onClick={() => {
          setOpen((current) => !current);
          setHighlightedIndex(0);
        }}
        className={`${inputClass} flex min-h-9 items-center justify-between gap-2 text-left`}
      >
        <span className={`truncate ${values.length === 0 ? "text-[var(--color-ink-secondary)]" : ""}`}>
          {values.length === 0 ? placeholder : values.length === 1 ? values[0] : `${values.length} selected`}
        </span>
        <ChevronDown size={15} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {values.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1" aria-label={`Selected ${label.toLowerCase()}`}>
          {values.map((value) => (
            <span key={value} className="inline-flex max-w-full items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs">
              <span className="truncate">{value}</span>
              <button
                type="button"
                aria-label={`Remove ${value}`}
                onClick={() => toggleValue(value)}
                className="shrink-0 rounded-sm text-[var(--color-ink-secondary)] hover:text-[var(--color-red-solid)]"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-full z-[60] mt-1 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
          <div className="relative border-b border-[var(--color-border)] p-2">
            <Search size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-ink-secondary)]" />
            <input
              ref={searchRef}
              type="text"
              role="combobox"
              aria-controls={listboxId}
              aria-expanded={open}
              aria-activedescendant={menuItemCount > 0 ? `${listboxId}-option-${highlightedIndex}` : undefined}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(false);
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setHighlightedIndex((current) => Math.min(current + 1, Math.max(0, menuItemCount - 1)));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setHighlightedIndex((current) => Math.max(current - 1, 0));
                } else if (event.key === "Enter" && filteredOptions[highlightedIndex]) {
                  event.preventDefault();
                  toggleValue(filteredOptions[highlightedIndex]);
                } else if (event.key === "Enter" && canAddCustom) {
                  event.preventDefault();
                  toggleValue(customValue);
                }
              }}
              placeholder={`Search ${label.toLowerCase()}`}
              className={`${inputClass} pl-8`}
            />
          </div>
          <div id={listboxId} role="listbox" aria-multiselectable="true" className="max-h-56 overflow-y-auto py-1">
            {filteredOptions.map((option, index) => {
              const selected = isSelected(option);
              return (
                <button
                  key={option}
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => toggleValue(option)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm ${selected ? "bg-[var(--color-primary-tint)] text-[var(--color-primary)]" : index === highlightedIndex ? "bg-[var(--color-surface-muted)]" : "hover:bg-[var(--color-surface-muted)]"}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${selected ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white" : "border-[var(--color-border-strong)]"}`}>
                    {selected && <Check size={11} />}
                  </span>
                  <span>{option}</span>
                </button>
              );
            })}
            {canAddCustom && (
              <button
                id={`${listboxId}-option-${filteredOptions.length}`}
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => toggleValue(customValue)}
                onMouseEnter={() => setHighlightedIndex(filteredOptions.length)}
                className={`flex w-full items-center gap-2 border-t border-[var(--color-border)] px-2.5 py-1.5 text-left text-sm font-semibold text-[var(--color-primary)] ${highlightedIndex === filteredOptions.length ? "bg-[var(--color-primary-tint)]" : "hover:bg-[var(--color-primary-tint)]"}`}
              >
                <Plus size={14} /> Add &quot;{customValue}&quot;
              </button>
            )}
            {filteredOptions.length === 0 && !canAddCustom && (
              <p className="px-2.5 py-2 text-sm text-[var(--color-ink-secondary)]">No matches</p>
            )}
          </div>
        </div>
      )}
    </div>
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

function Field({ label, required = false, className = "", children }: { label: ReactNode; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-secondary)]">
        {label}
        {required && <span className="ml-0.5 text-[var(--color-red-solid)]">*</span>}
      </span>
      {children}
    </label>
  );
}

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, " ").replace(/\s+/g, " ").trim();
}

function maskIdentifier(value: string) {
  const compact = value.replace(/\s+/g, "");
  return compact.length <= 4 ? compact : `${"*".repeat(Math.min(4, compact.length - 4))}${compact.slice(-4)}`;
}

function withoutEmptySelection(values: string[], emptySelection: string) {
  return values.filter((value) => value !== emptySelection);
}

function ageFromYear(year: string | null) {
  return year ? new Date().getFullYear() - Number(year) : "?";
}
