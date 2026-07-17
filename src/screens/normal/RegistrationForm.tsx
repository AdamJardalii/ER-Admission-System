import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Plus,
  Search,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import {
  addClinicalEvent,
  addRelatedPerson,
  createCriticalPatient,
  createEncounterForExistingPatient,
  createQuickRegistration,
  updateEncounterField,
} from "../../db/repo";
import { useAllPatients, usePatientEncounters } from "../../db/hooks";
import { fuzzyPatientMatches, birthYear } from "../../lib/registration";
import {
  CHIEF_COMPLAINT_CATALOG,
  CHIEF_COMPLAINT_CATEGORIES,
  CHIEF_COMPLAINT_OPTIONS,
  CHIEF_COMPLAINT_RECENT_MOCK,
  type ChiefComplaintCategoryId,
  type ChiefComplaintOption,
} from "../../lib/clinicalCatalog";
import { RELATIONSHIP_OPTIONS, TITLE_OPTIONS } from "../../lib/registrationCatalog";
import { FloatingDropdown } from "../../components/FloatingDropdown";
import type { AgeBand, ArrivalMethod, Patient, Sex } from "../../types";

const AGE_BANDS: AgeBand[] = ["0-1", "1-5", "5-12", "13-17", "18-30", "31-50", "51-70", "70+"];

const inputClass = "min-h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-tint)] max-[640px]:min-h-11";

const STEPS = ["Search", "Identity"] as const;
type Step = 0 | 1;

export function RegistrationForm() {
  const navigate = useNavigate();
  const patients = useAllPatients();
  const [step, setStep] = useState<Step>(0);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [useDob, setUseDob] = useState(false);
  const [form, setForm] = useState({
    patientType: "standard",
    title: "",
    name: "",
    firstNameEn: "",
    middleNameEn: "",
    lastNameEn: "",
    firstNameAr: "",
    sex: "unknown" as Sex,
    dob: "",
    ageBand: "18-30" as AgeBand,
    chiefComplaint: [] as string[],
    arrivalMethod: "walk_in" as ArrivalMethod,
    registrationNotes: "",
    companionPresent: "no",
    companionName: "",
    companionRelationship: "",
    companionPhone: "",
  });

  const matches = useMemo(
    () => fuzzyPatientMatches(patients, { text: query, phone: query, nationalId: query, dob: form.dob }),
    [patients, query, form.dob],
  );
  const strongMatch = matches.some((match) => match.strong);

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
  // Emergency care must not wait for a patient's name. An empty display name is
  // persisted as a synthetic temporary identity by createQuickRegistration.
  const canRegister = form.chiefComplaint.length > 0;

  async function register() {
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
      // Record an accompanying relative/companion, if one is present, as an
      // emergency contact so ER staff can reach them during the visit.
      if (form.companionPresent === "yes" && form.companionName.trim()) {
        await addRelatedPerson({
          patientId: created.patient.id,
          fullName: form.companionName.trim(),
          englishName: null,
          arabicName: null,
          relationship: form.companionRelationship || null,
          mobilePrimary: form.companionPhone.trim() || null,
          mobileSecondary: null,
          email: null,
          address: null,
          nationalId: null,
          isEmergencyContact: true,
          isNextOfKin: true,
          isSpouse: form.companionRelationship === "Spouse",
          isParent: form.companionRelationship === "Parent",
          isLegalGuardian: form.companionRelationship === "Guardian",
          isAuthorizedRepresentative: false,
          preferredContactMethod: "mobile",
          contactPriority: 1,
          notes: "Accompanying the patient at registration",
        }, "normal");
      }
      if (form.registrationNotes.trim()) {
        await addClinicalEvent(created.encounter.id, "note", { text: form.registrationNotes.trim(), actor: "Registrar", registrationNote: true }, null);
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
              Step {step + 1} of {STEPS.length}{step === 1 ? " | Identity and complaint" : " | Search existing records"}
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
            <Field label="Relative / companion present">
              <select value={form.companionPresent} onChange={(e) => update("companionPresent", e.target.value)} className={inputClass}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </Field>
            {form.companionPresent === "yes" && (
              <>
                <Field label="Companion name">
                  <input value={form.companionName} onChange={(e) => update("companionName", e.target.value)} placeholder="Full name" className={inputClass} />
                </Field>
                <Field label="Relationship">
                  <select value={form.companionRelationship} onChange={(e) => update("companionRelationship", e.target.value)} className={inputClass}>
                    <option value="">Select relationship</option>
                    {RELATIONSHIP_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                  </select>
                </Field>
                <Field label="Companion phone">
                  <input value={form.companionPhone} onChange={(e) => update("companionPhone", e.target.value)} placeholder="+961 ..." className={inputClass} />
                </Field>
              </>
            )}
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
            <button type="button" disabled={saving || !canRegister} onClick={() => void register()} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50">
              <Check size={16} /> {saving ? "Saving…" : "Register"}
            </button>
          </div>
        </section>
      )}
    </div>
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
  const helperId = useId();
  const statusId = useId();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeView, setActiveView] = useState<"common" | "recent" | "all">("common");
  const [activeCategory, setActiveCategory] = useState<ChiefComplaintCategoryId>("common");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [touched, setTouched] = useState(false);
  const [otherDraft, setOtherDraft] = useState("");
  const [otherOpen, setOtherOpen] = useState(false);
  const [recentComplaints, setRecentComplaints] = useState<string[]>(() => {
    if (typeof window === "undefined") return CHIEF_COMPLAINT_RECENT_MOCK;
    const stored = window.sessionStorage.getItem("chief-complaint-recent");
    return stored ? JSON.parse(stored) as string[] : CHIEF_COMPLAINT_RECENT_MOCK;
  });
  const normalizedQuery = query.trim().toLowerCase();
  const activeComplaints = CHIEF_COMPLAINT_CATALOG.filter((complaint) => complaint.active);
  const categoryLabels = new Map(CHIEF_COMPLAINT_CATEGORIES.map((category) => [category.id, category.label]));
  const categoryCounts = new Map<ChiefComplaintCategoryId, number>(
    CHIEF_COMPLAINT_CATEGORIES.map((category) => [
      category.id,
      category.id === "common"
        ? activeComplaints.filter((complaint) => complaint.common).length
        : activeComplaints.filter((complaint) => complaint.category === category.id).length,
    ]),
  );
  const matchesQuery = (complaint: ChiefComplaintOption) => {
    if (!normalizedQuery) return true;
    const haystack = [complaint.label, ...complaint.keywords].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  };
  const recentSet = new Set(recentComplaints.map((item) => item.toLowerCase()));
  const recentItems = recentComplaints
    .map((recent) => activeComplaints.find((complaint) => complaint.label.toLowerCase() === recent.toLowerCase()))
    .filter(Boolean) as ChiefComplaintOption[];
  const commonItems = activeComplaints
    .filter((complaint) => complaint.common && !recentSet.has(complaint.label.toLowerCase()))
    .sort((a, b) => (a.sortPriority ?? 999) - (b.sortPriority ?? 999) || a.label.localeCompare(b.label));
  const resultComplaints = normalizedQuery
    ? activeComplaints.filter(matchesQuery).sort((a, b) => Number(b.common) - Number(a.common) || a.label.localeCompare(b.label))
    : activeView === "recent"
      ? recentItems
      : activeView === "common"
      ? [...recentItems, ...commonItems]
      : activeComplaints.filter((complaint) => complaint.category === activeCategory).sort((a, b) => a.label.localeCompare(b.label));
  const exactMatch = normalizedQuery && (
    activeComplaints.some((complaint) => complaint.label.toLowerCase() === normalizedQuery)
    || options.some((option) => option.toLowerCase() === normalizedQuery)
  );
  const customValue = query.trim().replace(/\s+/g, " ").slice(0, 120);
  const canAddCustom = customValue.length > 0
    && !exactMatch
    && !values.some((value) => value.toLowerCase() === `other: ${customValue}`.toLowerCase());
  const menuItemCount = resultComplaints.length + (canAddCustom ? 1 : 0);
  const loading = false;
  const loadError = false;
  const visibleValues = values.slice(0, 3);
  const hiddenValueCount = Math.max(values.length - visibleValues.length, 0);
  const requiredError = required && touched && values.length === 0;
  const clinicalPrompt = values.some((value) => value.toLowerCase() === "chest pain")
    ? "Consider documenting pain onset and obtaining relevant vital signs."
    : values.some((value) => value.toLowerCase() === "suspected stroke")
      ? "Confirm time last known well."
      : values.some((value) => value.toLowerCase().includes("pregnancy"))
        ? "Confirm pregnancy status and gestational age."
        : null;

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  useEffect(() => {
    if (!open) setTouched(true);
  }, [open]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("chief-complaint-recent", JSON.stringify(recentComplaints.slice(0, 5)));
    }
  }, [recentComplaints]);

  function isSelected(value: string) {
    return values.some((selected) => selected.toLowerCase() === value.toLowerCase());
  }

  function remember(value: string) {
    const standardValue = value.startsWith("Other: ") ? null : value;
    if (!standardValue) return;
    setRecentComplaints((current) => [standardValue, ...current.filter((item) => item.toLowerCase() !== standardValue.toLowerCase())].slice(0, 5));
  }

  function toggleValue(value: string) {
    if (value === "Other / not listed") {
      setOtherOpen(true);
      setOtherDraft("");
      return;
    }
    if (isSelected(value)) {
      onChange(values.filter((selected) => selected.toLowerCase() !== value.toLowerCase()));
    } else if (exclusiveValues.some((exclusive) => exclusive.toLowerCase() === value.toLowerCase())) {
      onChange([value]);
    } else {
      const withoutExclusiveValues = values.filter(
        (selected) => !exclusiveValues.some((exclusive) => exclusive.toLowerCase() === selected.toLowerCase()),
      );
      onChange([...withoutExclusiveValues, value]);
      remember(value);
    }
    setQuery("");
    setHighlightedIndex(0);
  }

  function removeValue(value: string) {
    onChange(values.filter((selected) => selected !== value));
  }

  function makePrimary(value: string) {
    onChange([value, ...values.filter((selected) => selected !== value)]);
  }

  function addOther(value: string) {
    const clean = value.trim().replace(/\s+/g, " ").slice(0, 120);
    if (!clean) return;
    const next = `Other: ${clean}`;
    if (!isSelected(next)) onChange([...values, next]);
    setOtherDraft("");
    setOtherOpen(false);
    setQuery("");
    setHighlightedIndex(0);
  }

  function moveHighlight(delta: number) {
    setHighlightedIndex((current) => Math.min(Math.max(current + delta, 0), Math.max(menuItemCount - 1, 0)));
  }

  function chooseHighlighted() {
    const complaint = resultComplaints[highlightedIndex];
    if (complaint) toggleValue(complaint.label);
    else if (canAddCustom) addOther(customValue);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setHighlightedIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setHighlightedIndex(Math.max(menuItemCount - 1, 0));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      chooseHighlighted();
    } else if (event.key === "Backspace" && !query && values.length > 0) {
      removeValue(values[values.length - 1]);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span id={labelId} className="text-xs font-semibold text-[var(--color-ink-secondary)]">
          {label}
          {required && <span className="ml-0.5 text-[var(--color-red-solid)]">*</span>}
        </span>
        <span id={helperId} className="text-xs text-[var(--color-ink-secondary)]">Select the patient's main reason for visiting.</span>
      </div>
      <div
        ref={triggerRef}
        role="combobox"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-describedby={`${helperId} ${statusId}`}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-required={required}
        aria-invalid={requiredError || undefined}
        onClick={() => {
          setOpen(true);
          setHighlightedIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          } else if (event.key === "Backspace" && values.length > 0) {
            event.preventDefault();
            removeValue(values[values.length - 1]);
          }
        }}
        className={`complaint-combobox ${requiredError ? "complaint-combobox-error" : ""}`}
      >
        <Search size={15} className="complaint-combobox-search" aria-hidden="true" />
        <div className="complaint-chip-area" aria-label={`Selected ${label.toLowerCase()}`}>
          {values.length === 0 ? (
            <span className="complaint-placeholder">{placeholder}</span>
          ) : (
            <>
              {visibleValues.map((value, index) => (
                <span key={value} className="complaint-chip">
                  <button type="button" onClick={(event) => { event.stopPropagation(); if (index > 0) makePrimary(value); }} title={index > 0 ? `Make ${value} primary` : `${value} is primary`}>
                    {value}{index === 0 && <em>Primary</em>}
                  </button>
                  <button type="button" aria-label={`Remove ${value}`} onClick={(event) => { event.stopPropagation(); removeValue(value); }}>
                    <X size={12} />
                  </button>
                </span>
              ))}
              {hiddenValueCount > 0 && <span className="complaint-more" title={values.slice(visibleValues.length).join(", ")}>+{hiddenValueCount} more</span>}
            </>
          )}
        </div>
        <ChevronDown size={15} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>
      <span id={statusId} className="sr-only">{resultComplaints.length} complaint result{resultComplaints.length === 1 ? "" : "s"}. {values.length} selected.</span>
      {requiredError && <p className="complaint-error">Select at least one chief complaint.</p>}
      {clinicalPrompt && <p className="complaint-context">{clinicalPrompt}</p>}

      {open && (
        <FloatingDropdown
          open={open}
          triggerRef={triggerRef}
          contentRef={menuRef}
          matchTriggerWidth
          minHeight={260}
          className="complaint-popover complaint-popover-fullscreen"
        >
          <div className="complaint-popover-shell">
            <div className="complaint-modal-header">
              <div>
                <h2>Chief complaint</h2>
                <p>Select one or more presenting complaints. The first selection is primary.</p>
              </div>
              <button type="button" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>
                <X size={15} /> Close
              </button>
            </div>
            <div className="complaint-search-header">
              <div className="complaint-search-box">
                <Search size={15} aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="text"
                  role="searchbox"
                  aria-controls={listboxId}
                  aria-activedescendant={menuItemCount > 0 ? `${listboxId}-option-${highlightedIndex}` : undefined}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setHighlightedIndex(0);
                  }}
                  onKeyDown={onSearchKeyDown}
                  placeholder="Search complaint, symptom, or keyword"
                />
                {query && <button type="button" aria-label="Clear complaint search" onClick={() => { setQuery(""); setHighlightedIndex(0); }}><X size={14} /></button>}
              </div>
              <span>Esc</span>
            </div>

            <div className="complaint-tab-row" role="tablist" aria-label="Complaint views">
              {(["common", "recent", "all"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  aria-selected={activeView === tab}
                  onClick={() => {
                    setQuery("");
                    setActiveView(tab);
                    setActiveCategory(tab === "all" ? "cardiovascular" : "common");
                  }}
                >
                  {tab === "common" ? "Common" : tab === "recent" ? "Recent" : "All categories"}
                </button>
              ))}
            </div>

            <div className="complaint-popover-body">
              <nav className="complaint-category-list" aria-label="Chief complaint categories">
                {CHIEF_COMPLAINT_CATEGORIES.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    aria-current={activeCategory === category.id ? "true" : undefined}
                    onClick={() => {
                      setActiveView(category.id === "common" ? "common" : "all");
                      setActiveCategory(category.id);
                      setQuery("");
                      setHighlightedIndex(0);
                    }}
                  >
                    <span>{category.label}</span>
                    <em>{categoryCounts.get(category.id) ?? 0}</em>
                  </button>
                ))}
              </nav>

              <div className="complaint-result-panel">
                <div className="complaint-mobile-categories" aria-label="Chief complaint categories">
                  {CHIEF_COMPLAINT_CATEGORIES.map((category) => (
                    <button key={category.id} type="button" aria-current={activeCategory === category.id ? "true" : undefined} onClick={() => { setActiveView(category.id === "common" ? "common" : "all"); setActiveCategory(category.id); setQuery(""); }}>
                      {category.label} <span>{categoryCounts.get(category.id) ?? 0}</span>
                    </button>
                  ))}
                </div>
                <div className="complaint-result-toolbar">
                  <strong>{normalizedQuery ? "Search results" : activeView === "recent" ? "Recently used" : activeCategory === "common" ? "Common complaints" : categoryLabels.get(activeCategory)}</strong>
                  <span>{resultComplaints.length} result{resultComplaints.length === 1 ? "" : "s"}</span>
                </div>
                {!loading && !loadError && (
                  <div id={listboxId} role="listbox" aria-multiselectable="true" className="complaint-results">
                    {resultComplaints.map((complaint, index) => {
                      const selected = isSelected(complaint.label);
                      const context = activeCategory === "common" || normalizedQuery ? categoryLabels.get(complaint.category) : undefined;
                      return (
                        <button
                          key={complaint.id}
                          id={`${listboxId}-option-${index}`}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => toggleValue(complaint.label)}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          className={`${selected ? "complaint-result-selected" : ""} ${highlightedIndex === index ? "complaint-result-active" : ""}`}
                          title={complaint.label}
                        >
                          <span className="complaint-checkbox" aria-hidden="true">{selected && <Check size={11} />}</span>
                          <span className="complaint-result-label">{highlightMatch(complaint.label, query)}</span>
                          {context && <em>{context}</em>}
                        </button>
                      );
                    })}
                    {canAddCustom && (
                      <button
                        id={`${listboxId}-option-${resultComplaints.length}`}
                        type="button"
                        role="option"
                        aria-selected="false"
                        onClick={() => addOther(customValue)}
                        onMouseEnter={() => setHighlightedIndex(resultComplaints.length)}
                        className={`complaint-add-other ${highlightedIndex === resultComplaints.length ? "complaint-result-active" : ""}`}
                      >
                        <Plus size={14} /> Add &quot;{customValue}&quot; as other complaint
                      </button>
                    )}
                    {resultComplaints.length === 0 && !canAddCustom && <div className="complaint-empty">No matching complaint found.</div>}
                  </div>
                )}
                {loading && <div className="complaint-skeleton" aria-label="Loading chief complaints"><span /><span /><span /><span /></div>}
                {loadError && <div className="complaint-empty complaint-error-state">Chief complaints could not be loaded. <button type="button">Retry</button></div>}
                {otherOpen && (
                  <div className="complaint-other-editor">
                    <label>
                      <span>Describe the chief complaint</span>
                      <input value={otherDraft} maxLength={120} onChange={(event) => setOtherDraft(event.target.value)} placeholder="e.g. Pain behind left eye" />
                    </label>
                    <button type="button" onClick={() => addOther(otherDraft)}>Add other</button>
                  </div>
                )}
              </div>
              <aside className="complaint-selection-rail" aria-label="Selected chief complaints">
                <div>
                  <h3>Selected</h3>
                  <span>{values.length}</span>
                </div>
                {values.length === 0 ? (
                  <p>No chief complaint selected yet.</p>
                ) : (
                  <ol>
                    {values.map((value, index) => (
                      <li key={value}>
                        <button type="button" onClick={() => index > 0 && makePrimary(value)} title={index > 0 ? `Make ${value} primary` : `${value} is primary`}>
                          <strong>{value}</strong>
                          {index === 0 && <em>Primary</em>}
                        </button>
                        <button type="button" aria-label={`Remove ${value}`} onClick={() => removeValue(value)}><X size={13} /></button>
                      </li>
                    ))}
                  </ol>
                )}
                {clinicalPrompt && <div className="complaint-rail-prompt">{clinicalPrompt}</div>}
              </aside>
            </div>

            <footer className="complaint-footer">
              <span>{values.length} selected</span>
              <button type="button" onClick={() => onChange([])} disabled={values.length === 0}>Clear all</button>
              <button type="button" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>Apply</button>
            </footer>
          </div>
        </FloatingDropdown>
      )}
    </div>
  );
}

function highlightMatch(label: string, query: string) {
  const term = query.trim();
  if (!term) return label;
  const index = label.toLowerCase().indexOf(term.toLowerCase());
  if (index < 0) return label;
  return (
    <>
      {label.slice(0, index)}
      <mark>{label.slice(index, index + term.length)}</mark>
      {label.slice(index + term.length)}
    </>
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

function ageFromYear(year: string | null) {
  return year ? new Date().getFullYear() - Number(year) : "?";
}
