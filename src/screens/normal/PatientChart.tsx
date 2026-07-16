import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  Activity,
  Banknote,
  Beaker,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ClipboardList,
  Edit3,
  FileClock,
  FileText,
  FlaskConical,
  History as HistoryIcon,
  LayoutDashboard,
  ListChecks,
  MapPin,
  Menu,
  MoreVertical,
  Paperclip,
  Pill,
  QrCode,
  Scissors,
  Save,
  Search,
  ShieldAlert,
  Signpost,
  Stethoscope,
  Syringe,
  TestTube2,
  UserRound,
  UserRoundCheck,
  X as CloseIcon,
} from "lucide-react";
import {
  useEncounterView,
  useClinicalEvents,
  useAuditEvents,
  useVitalsSets,
  useAllPatients,
  useStateTransitions,
  useBeds,
  useZones,
  useMedications,
  useConditions,
  useOrderRecords,
  useResultRecords,
  useProcedures,
  useImmunizations,
  usePrograms,
  useBillingItems,
  useAttachments,
  usePatientIdentifiers,
  useRelatedPersons,
  useInsurancePolicies,
  useCivilRegistryRecord,
  useEmploymentRecord,
  useMilitaryRecord,
  usePendingCases,
} from "../../db/hooks";
import { db } from "../../db/db";
import { TriageBadge } from "../../components/TriageBadge";
import { AiChip } from "../../components/AiChip";
import { PatientIdentityModal } from "../../components/PatientIdentityModal";
import { PatientJourney } from "../../components/PatientJourney";
import { PatientVisits } from "../../components/PatientVisits";
import {
  AssessmentWorkflow,
  CareWorkflow,
  DispositionWorkflow,
  TriageHistory,
} from "./ClinicalWorkflow";
import {
  updatePatientField,
  updateEncounterField,
  setTriage,
  completeRegistration,
  mergePatientRecords,
  setEncounterPathway,
  assignLocation,
  addPatientIdentifier,
  updatePatientIdentifier,
  removePatientIdentifier,
  addRelatedPerson,
  updateRelatedPerson,
  removeRelatedPerson,
  addInsurancePolicy,
  updateInsurancePolicy,
  removeInsurancePolicy,
  upsertCivilRegistryRecord,
  upsertEmploymentRecord,
  upsertMilitaryRecord,
} from "../../db/repo";
import { useAppStore } from "../../store/useAppStore";
import { triageRank, isEsi, triagePalette } from "../../lib/triage";
import { fuzzyPatientMatches } from "../../lib/registration";
import {
  BLOOD_GROUP_OPTIONS,
  COUNTRY_OPTIONS,
  EMPLOYMENT_INDUSTRY_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  INSURANCE_COVERAGE_CLASS_OPTIONS,
  INSURANCE_PAYER_OPTIONS,
  INSURANCE_PLAN_OPTIONS,
  LANGUAGE_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  MILITARY_INSTITUTION_OPTIONS,
  MILITARY_RANK_OPTIONS,
  MILITARY_SECTION_OPTIONS,
  MILITARY_ZONE_OPTIONS,
  NATIONALITY_OPTIONS,
  RELATIONSHIP_OPTIONS,
  TITLE_OPTIONS,
} from "../../lib/registrationCatalog";
import { latestVitals } from "../../lib/vitals";
import {
  News2Banner,
  TriageVitalsAdvisory,
  CurrentVitalsSummary,
  VitalsCaptureForm,
  VitalsFlowsheet,
  VitalsHeader,
} from "../../components/VitalsPanel";
import { AllergiesBanner } from "./chart/AllergiesBanner";
import { DomainTab, StatusPill } from "../../components/DomainTab";
import {
  MedicationsTab,
  ConditionsTab,
  OrdersTab,
  ResultsTab,
  ProceduresTab,
  ImmunizationsTab,
  ProgramsTab,
  BillingTab,
  AttachmentsTab,
} from "./chart/domainTabs";
import type { EsiLevel, Patient, IdentifierType, InsurancePolicy, PatientIdentifier, RelatedPerson } from "../../types";

type NavIcon = typeof LayoutDashboard;

const NAV_GROUPS = [
  {
    label: "Patient summary",
    items: [
      { tab: "Overview", label: "Overview", icon: LayoutDashboard },
      { tab: "Personal", label: "Personal information", icon: UserRound },
      { tab: "Vitals", label: "Vitals & biometrics", icon: Activity },
    ],
  },
  {
    label: "Clinical records",
    items: [
      { tab: "Medications", label: "Medications", icon: Pill },
      { tab: "Conditions", label: "Conditions", icon: Stethoscope },
      { tab: "Orders", label: "Orders", icon: FlaskConical },
      { tab: "Results", label: "Results", icon: TestTube2 },
      { tab: "Procedures", label: "Procedures", icon: Scissors },
      { tab: "Immunizations", label: "Immunizations", icon: Syringe },
    ],
  },
  {
    label: "Care & workflow",
    items: [
      { tab: "Assessment", label: "Assessment", icon: ClipboardList },
      { tab: "Care", label: "Care", icon: Beaker },
      { tab: "Triage", label: "Triage", icon: ShieldAlert },
      { tab: "Disposition", label: "Disposition", icon: Signpost },
    ],
  },
  {
    label: "Other",
    items: [
      { tab: "Programs", label: "Programs", icon: ListChecks },
      { tab: "Billing", label: "Billing", icon: Banknote },
      { tab: "Attachments", label: "Attachments", icon: Paperclip },
      { tab: "Notes", label: "Notes", icon: FileText },
      { tab: "Timeline", label: "Timeline", icon: FileClock },
      { tab: "Visits", label: "Visits", icon: HistoryIcon },
      { tab: "History", label: "History", icon: HistoryIcon },
    ],
  },
] satisfies { label: string; items: { tab: string; label: string; icon: NavIcon }[] }[];

const TABS = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.tab));
type Tab = (typeof NAV_GROUPS)[number]["items"][number]["tab"];

const ESI_DESCRIPTIONS: Record<EsiLevel, string> = {
  1: "Immediate life-saving intervention required",
  2: "High risk situation, severe pain/distress",
  3: "Multiple resources needed, stable",
  4: "One resource needed, stable",
  5: "No resources needed, stable",
};

const ESI_SHORT_LABELS: Record<EsiLevel, string> = {
  1: "Immediate",
  2: "High risk",
  3: "Multiple resources",
  4: "One resource",
  5: "No resources",
};

export function PatientChart() {
  const { encounterId } = useParams<{ encounterId: string }>();
  const [searchParams] = useSearchParams();
  const view = useEncounterView(encounterId);
  const requestedTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(TABS.includes(requestedTab as Tab) ? requestedTab as Tab : "Overview");
  const [retriageOpen, setRetriageOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [personalDirty, setPersonalDirty] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const mobileNavCloseRef = useRef<HTMLButtonElement>(null);
  const vitalsSets = useVitalsSets(encounterId);

  useEffect(() => {
    if (!moreOpen) return;
    function handlePointer(event: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) setMoreOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!navOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    window.setTimeout(() => mobileNavCloseRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [navOpen]);

  if (!view) {
    return <div className="p-3 text-sm text-[var(--color-ink-secondary)]">Patient not found.</div>;
  }

  const { patient, encounter, triage } = view;
  const currentVitals = latestVitals(vitalsSets);
  const initials = (patient.name ?? patient.displayNumber)
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const patientAge = patient.dateOfBirth
    ? `${ageFromDob(patient.dateOfBirth)} yrs`
    : patient.ageValue != null
      ? `${patient.ageValue} ${patient.ageUnit ?? "years"}`
      : patient.estimatedAgeRange ?? "Age unknown";
  const dateOfBirth = patient.dateOfBirth
    ? new Date(`${patient.dateOfBirth}T00:00:00`).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })
    : null;

  function openTab(nextTab: Tab) {
    if (nextTab !== tab && tab === "Personal" && personalDirty) {
      const leave = window.confirm("Discard unsaved patient information changes?");
      if (!leave) return;
      setPersonalDirty(false);
    }
    setTab(nextTab);
    setNavOpen(false);
  }

  return (
    <div className="patient-chart-shell">
      <aside className="patient-chart-sidebar" aria-label="Patient chart navigation">
        <PatientNavigation activeTab={tab} onSelect={openTab} />
      </aside>

      <div className="min-w-0">
        <header className="patient-identity-header">
          <div className="mb-2 hidden items-center gap-2 max-[1099px]:flex">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-semibold"
              aria-label="Open patient chart navigation"
            >
              <Menu size={17} /> {labelForTab(tab)}
            </button>
          </div>

          <div className="flex min-w-0 flex-wrap items-start gap-3">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-[var(--color-primary-tint)] text-xl font-bold text-[var(--color-primary)]"
              aria-hidden="true"
            >
              {initials}
            </div>

            <div className="min-w-[240px] flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h1 className="break-words text-2xl font-semibold">{patient.name ?? "Unknown patient"}</h1>
                <span className="text-sm font-medium capitalize text-[var(--color-ink-secondary)]">{patient.sex ?? "sex unknown"}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--color-ink-secondary)]">
                <span className="font-medium text-[var(--color-ink)]">{patientAge}</span>
                {dateOfBirth && <span className="inline-flex items-center gap-1"><CalendarDays size={14} /> DOB {dateOfBirth}</span>}
                <span className="font-semibold text-[var(--color-primary)]">MRN {patient.mrn ?? patient.displayNumber}</span>
                <span className="font-medium text-[var(--color-ink)]">Case {encounter.caseNumber ?? encounter.id.slice(0, 8)}</span>
              </div>
            </div>

            <div className="flex max-w-[440px] flex-wrap items-center gap-2 max-[720px]:w-full max-[720px]:max-w-none">
              <span className="rounded bg-[var(--color-primary-tint)] px-2 py-1 text-sm font-semibold text-[var(--color-primary)]">
                {encounter.closedAt ? "Visit closed" : "Active visit"}
              </span>
              <span className="rounded bg-[var(--color-surface-muted)] px-2 py-1 text-sm font-medium capitalize text-[var(--color-ink-secondary)]">
                {encounter.state.replace(/_/g, " ")}
              </span>
              <span className="rounded bg-[var(--color-surface-muted)] px-2 py-1 text-sm font-medium capitalize text-[var(--color-ink-secondary)]">
                {(encounter.pathway ?? "standard").replace(/_/g, " ")} pathway
              </span>
              <span className={`inline-flex items-center gap-1 text-sm font-semibold ${encounter.currentLocationName ? "text-[var(--color-primary)]" : "text-[var(--color-yellow-text)]"}`}>
                <MapPin size={15} /> {encounter.currentLocationName ?? "Location unassigned"}
              </span>
              {patient.registrationComplete === false && (
                <button
                  className="inline-flex items-center gap-1 rounded bg-[var(--color-yellow-tint)] px-2 py-1 text-sm font-semibold text-[var(--color-yellow-text)]"
                  onClick={() => openTab("Personal")}
                >
                  <Clock3 size={14} /> Registration incomplete
                </button>
              )}
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1 max-[720px]:ml-0">
              <button
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold hover:bg-[var(--color-surface-muted)]"
                onClick={() => setIdentityOpen(true)}
              >
                <QrCode size={16} /> Patient ID
              </button>
              <div className="relative" ref={moreMenuRef}>
                <button
                  type="button"
                  aria-label="More patient actions"
                  aria-haspopup="true"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((value) => !value)}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
                >
                  <MoreVertical size={18} />
                </button>
                {moreOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-1 w-52 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-card)]"
                  >
                    <button
                      role="menuitem"
                      className="block min-h-10 w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-muted)]"
                      onClick={() => {
                        setMoreOpen(false);
                        setMergeOpen(true);
                      }}
                    >
                      Merge duplicate record
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--color-border)] pt-3">
            <div className="inline-flex min-h-9 items-center gap-1.5 text-sm max-[720px]:order-3">
              <UserRoundCheck size={16} className="text-[var(--color-primary)]" />
              <span className="text-[var(--color-ink-secondary)]">Provider</span>
              <strong>{encounter.currentProvider ?? "Unassigned"}</strong>
              {encounter.assignedNurse && <span className="text-[var(--color-ink-secondary)]">| Nurse {encounter.assignedNurse}</span>}
            </div>
            <div className="max-[720px]:order-1"><TriageBadge level={triage} size="sm" /></div>
            <VitalsHeader sets={vitalsSets} triage={triage} />
            <AllergiesBanner encounterId={encounter.id} encounter={encounter} />
            <div className="ml-auto flex shrink-0 items-center gap-2 max-[720px]:order-4 max-[720px]:ml-0">
              <button
                type="button"
                onClick={() => setRetriageOpen(true)}
                className="min-h-10 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold hover:bg-[var(--color-surface-muted)]"
              >
                Re-triage
              </button>
              <button
                type="button"
                className="min-h-10 rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
                onClick={() => openTab("Disposition")}
              >
                Disposition
              </button>
            </div>
          </div>
          <News2Banner latest={currentVitals} onRetriage={() => setRetriageOpen(true)} />
        </header>

        <main className="patient-chart-workspace">
          {tab === "Overview" && <OverviewTab encounterId={encounter.id} patientId={patient.id} onOpenTab={openTab} />}
          {tab === "Personal" && <PersonalTab encounterId={encounter.id} patientId={patient.id} onDirtyChange={setPersonalDirty} />}
          {tab === "Vitals" && <VitalsTab encounterId={encounter.id} sets={vitalsSets} />}
          {tab === "Medications" && <MedicationsTab patientId={patient.id} encounterId={encounter.id} />}
          {tab === "Conditions" && <ConditionsTab patientId={patient.id} encounterId={encounter.id} />}
          {tab === "Orders" && <OrdersTab patientId={patient.id} encounterId={encounter.id} />}
          {tab === "Results" && <ResultsTab patientId={patient.id} encounterId={encounter.id} />}
          {tab === "Procedures" && <ProceduresTab patientId={patient.id} encounterId={encounter.id} />}
          {tab === "Immunizations" && <ImmunizationsTab patientId={patient.id} encounterId={encounter.id} />}
          {tab === "Programs" && <ProgramsTab patientId={patient.id} encounterId={encounter.id} />}
          {tab === "Billing" && <BillingTab patientId={patient.id} encounterId={encounter.id} />}
          {tab === "Attachments" && <AttachmentsTab patientId={patient.id} encounterId={encounter.id} />}
          {tab === "Assessment" && <AssessmentWorkflow encounterId={encounter.id} />}
          {tab === "Care" && <CareWorkflow encounterId={encounter.id} />}
          {tab === "Triage" && <TriageTab encounterId={encounter.id} currentLevel={triage} latest={latestVitals(vitalsSets)} />}
          {tab === "Disposition" && <DispositionWorkflow encounterId={encounter.id} />}
          {tab === "Notes" && <NotesTab encounterId={encounter.id} />}
          {tab === "Timeline" && <PatientJourney encounterId={encounter.id} />}
          {tab === "Visits" && <PatientVisits patientId={patient.id} currentEncounterId={encounter.id} />}
          {tab === "History" && <HistoryTab patientId={patient.id} encounterId={encounter.id} />}
        </main>
      </div>

      {navOpen && (
        <div className="fixed inset-x-0 bottom-0 top-[var(--app-header-height)] z-[70] min-[1100px]:hidden" role="dialog" aria-modal="true" aria-label="Patient chart navigation">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} aria-label="Close patient navigation" />
          <aside className="relative h-full w-[min(88vw,330px)] overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
            <div className="sticky top-0 z-10 flex min-h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4">
              <strong>Patient chart</strong>
              <button
                ref={mobileNavCloseRef}
                type="button"
                aria-label="Close patient navigation"
                onClick={() => setNavOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-[var(--color-surface-muted)]"
              >
                <CloseIcon size={19} />
              </button>
            </div>
            <PatientNavigation activeTab={tab} onSelect={openTab} />
          </aside>
        </div>
      )}

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
      {mergeOpen && <MergeModal survivor={patient} onClose={() => setMergeOpen(false)} />}
    </div>
  );
}

function PatientNavigation({ activeTab, onSelect }: { activeTab: Tab; onSelect: (tab: Tab) => void }) {
  return (
    <nav aria-label="Patient chart sections" className="space-y-4 py-3">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="mb-1 px-4 text-xs font-bold uppercase text-[var(--color-ink-secondary)]">{group.label}</div>
          <div>
            {group.items.map(({ tab: itemTab, label, icon: Icon }) => (
              <button
                key={itemTab}
                type="button"
                aria-current={activeTab === itemTab ? "page" : undefined}
                onClick={() => onSelect(itemTab)}
                className={`flex min-h-10 w-full items-center gap-2.5 border-l-[3px] px-4 text-left text-sm ${
                  activeTab === itemTab
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] font-semibold text-white"
                    : "border-transparent text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
                }`}
              >
                <Icon size={17} className="shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function labelForTab(tab: Tab) {
  return NAV_GROUPS.flatMap((group) => group.items).find((item) => item.tab === tab)?.label ?? tab;
}

function ageFromDob(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

const PATIENT_DETAILS_SECTIONS = [
  "Identity",
  "Contact & Address",
  "Family & Emergency",
  "Insurance",
  "Civil Registry & IDs",
  "Employment",
  "Military",
  "Registrations",
  "Pending Cases",
] as const;
type PatientDetailsSection = (typeof PATIENT_DETAILS_SECTIONS)[number];

const OVERVIEW_LINKS: { tab: Tab; label: string; useHook: (p: string, e: string) => number }[] = [
  { tab: "Medications", label: "Medications", useHook: (p) => useMedications(p).length },
  { tab: "Conditions", label: "Conditions", useHook: (p) => useConditions(p).length },
  { tab: "Orders", label: "Orders", useHook: (_p, e) => useOrderRecords(e).length },
  { tab: "Results", label: "Results", useHook: (_p, e) => useResultRecords(e).length },
  { tab: "Procedures", label: "Procedures", useHook: (_p, e) => useProcedures(e).length },
  { tab: "Immunizations", label: "Immunizations", useHook: (p) => useImmunizations(p).length },
  { tab: "Programs", label: "Programs", useHook: (p) => usePrograms(p).length },
  { tab: "Billing", label: "Billing", useHook: (_p, e) => useBillingItems(e).length },
  { tab: "Attachments", label: "Attachments", useHook: (_p, e) => useAttachments(e).length },
];

function OverviewTab({ encounterId, patientId, onOpenTab }: { encounterId: string; patientId: string; onOpenTab: (tab: Tab) => void }) {
  const view = useEncounterView(encounterId);
  const events = useClinicalEvents(encounterId);
  const counts = OVERVIEW_LINKS.map((link) => link.useHook(patientId, encounterId));

  if (!view) return null;
  const { patient, encounter } = view;
  const recentEvents = events.slice(0, 8);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)] gap-3 max-[980px]:grid-cols-1">
      <div className="space-y-3">
        <section className="card overflow-hidden p-0">
          <div className="border-b border-[var(--color-border)] px-3 py-2.5">
            <h2 className="text-base font-semibold">Clinical records</h2>
          </div>
          <div className="grid grid-cols-3 max-[720px]:grid-cols-2 max-[460px]:grid-cols-1">
            {OVERVIEW_LINKS.map((link, i) => (
              <button
                key={link.tab}
                type="button"
                onClick={() => onOpenTab(link.tab)}
                className="flex min-h-12 items-center gap-3 border-b border-r border-[var(--color-border)] px-3 text-left hover:bg-[var(--color-primary-tint)]"
              >
                <span className="min-w-0 flex-1 text-sm font-semibold">{link.label}</span>
                <span className="text-base font-bold tabular-nums text-[var(--color-primary)]">{counts[i]}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="mb-3 border-b border-[var(--color-border)] pb-2">
            <h2 className="text-base font-semibold">Current encounter</h2>
          </div>
          <div className="mb-3 border-l-[3px] border-[var(--color-primary)] bg-[var(--color-primary-tint)] px-3 py-2">
            <div className="text-xs font-semibold text-[var(--color-ink-secondary)]">Chief complaint</div>
            <div className="mt-0.5 break-words text-base font-semibold">{encounter.chiefComplaint ?? "—"}</div>
          </div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm max-[720px]:grid-cols-2 max-[460px]:grid-cols-1">
            <InfoLine label="Arrival" value={(encounter.arrivalMethod ?? "walk in").replace(/_/g, " ")} />
            <InfoLine label="Provider" value={encounter.currentProvider ?? "Unassigned"} />
            <InfoLine label="Location" value={encounter.currentLocationName ?? "Unassigned"} />
            <InfoLine label="Pathway" value={(encounter.pathway ?? "standard").replace(/_/g, " ")} />
            <InfoLine label="Disposition" value={(encounter.disposition ?? "pending").replace(/_/g, " ")} />
          </div>
          {patient.registrationComplete === false && (
            <button
              type="button"
              onClick={() => onOpenTab("Personal")}
              className="mt-3 inline-flex min-h-10 items-center rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white"
            >
              Complete registration
            </button>
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="mb-3 border-b border-[var(--color-border)] pb-2 text-base font-semibold">Recent activity</h2>
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
      </section>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-secondary)]">{label}</span>
      <span className="block break-words text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

type SaveFn = (value: string) => void | Promise<unknown>;

interface StagedPatientField {
  initialValue: string;
  value: string;
  onSave: SaveFn;
}

interface PersonalEditContextValue {
  editing: boolean;
  scope: PatientDetailsSection;
  drafts: Record<string, StagedPatientField>;
  stageField: (key: string, initialValue: string, value: string, onSave: SaveFn) => void;
}

const PersonalEditContext = createContext<PersonalEditContextValue | null>(null);

function PersonalTab({
  encounterId,
  patientId,
  onDirtyChange,
}: {
  encounterId: string;
  patientId: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const view = useEncounterView(encounterId);
  const mode = useAppStore((s) => s.mode);
  const pushToast = useAppStore((s) => s.pushToast);
  const [detailsSection, setDetailsSection] = useState<PatientDetailsSection>("Identity");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, StagedPatientField>>({});
  const civilRegistry = useCivilRegistryRecord(patientId);
  const employment = useEmploymentRecord(patientId);
  const military = useMilitaryRecord(patientId);
  const dirty = Object.keys(drafts).length > 0;

  const stageField = useCallback((key: string, initialValue: string, value: string, onSave: SaveFn) => {
    setDrafts((current) => {
      const original = current[key]?.initialValue ?? initialValue;
      const next = { ...current };
      if (value === original) delete next[key];
      else next[key] = { initialValue: original, value, onSave };
      return next;
    });
    setSaveError(null);
  }, []);

  const editContext = useMemo<PersonalEditContextValue>(() => ({
    editing,
    scope: detailsSection,
    drafts,
    stageField,
  }), [detailsSection, drafts, editing, stageField]);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  function startEditing() {
    setDrafts({});
    setSaveError(null);
    setEditing(true);
  }

  function cancelEditing() {
    if (dirty && !window.confirm("Discard unsaved patient information changes?")) return;
    setDrafts({});
    setSaveError(null);
    setEditing(false);
  }

  async function saveChanges() {
    if (!dirty || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      for (const field of Object.values(drafts)) await field.onSave(field.value);
      setDrafts({});
      setEditing(false);
      pushToast("Patient information updated");
    } catch {
      setSaveError("Patient information could not be saved. Review the entries and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!view) return null;
  const { patient, encounter } = view;
  const calculatedAge = patient.dateOfBirth ? `${ageFromDob(patient.dateOfBirth)} years` : "";
  const militaryEnabled = Boolean(military?.enabled);

  return (
    <PersonalEditContext.Provider value={editContext}>
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div className="mr-auto min-w-[220px]">
          <h2 className="text-lg font-semibold">{editing ? "Editing patient information" : "Patient information"}</h2>
          <div className="mt-1 inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-secondary)]">
            <CheckCircle2 size={15} className="text-[var(--color-primary)]" />
            Identity {patient.identityStatus.replace(/_/g, " ")}
          </div>
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={cancelEditing} className="min-h-10 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveChanges()}
              disabled={!dirty || saving}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Save size={16} /> {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white"
          >
            <Edit3 size={16} /> Edit information
          </button>
        )}
      </div>

      {saveError && <div role="alert" className="border border-[var(--color-red-solid)] bg-[var(--color-red-tint)] px-3 py-2 text-sm font-semibold text-[var(--color-red-text)]">{saveError}</div>}

      <div className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2" role="tablist" aria-label="Personal detail sections">
        {PATIENT_DETAILS_SECTIONS.map((section) => (
          <button
            key={section}
            type="button"
            role="tab"
            aria-selected={detailsSection === section}
            onClick={() => setDetailsSection(section)}
            className={`min-h-10 whitespace-nowrap border-b-2 px-2.5 text-sm font-semibold ${
              detailsSection === section
                ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                : "border-transparent text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
            {section}
          </button>
        ))}
      </div>

      {detailsSection === "Identity" && (
        <div className="space-y-3">
          <section className="patient-profile-section">
            <h3 className="mb-2 text-sm font-semibold">Identity and demographics</h3>
            <div className="grid grid-cols-3 gap-3 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
              <SelectField label="Patient type" value={patient.patientType ?? "standard"} options={["standard", "unknown", "trauma", "visitor", "staff"]} onSave={(v) => updatePatientField(patientId, "patientType", v, mode)} />
              <SelectField label="Confidentiality" value={patient.confidentialityLevel ?? "normal"} options={["normal", "restricted", "vip"]} onSave={(v) => updatePatientField(patientId, "confidentialityLevel", v, mode)} />
              <SelectField label="Title" value={patient.title ?? ""} options={TITLE_OPTIONS} placeholder="Select title" historyEntityId={patientId} historyField="title" onSave={(v) => updatePatientField(patientId, "title", v || null, mode)} />
              <InfoLine label="MRN" value={patient.mrn ?? "Generated after save"} />
              <EditableField label="Secondary / legacy MRN" value={patient.secondaryMrn ?? ""} historyEntityId={patientId} historyField="secondaryMrn" onSave={(v) => updatePatientField(patientId, "secondaryMrn", v || null, mode)} />
              <SelectField label="Identity status" value={patient.identityStatus} options={["confirmed", "provisional", "unknown", "pending_verification", "merged"]} onSave={(v) => updatePatientField(patientId, "identityStatus", v, mode)} />
            </div>
          </section>

          <section className="patient-profile-section">
            <h3 className="mb-2 text-sm font-semibold">Names</h3>
            <div className="grid grid-cols-4 gap-3 max-[980px]:grid-cols-2 max-[560px]:grid-cols-1">
              <EditableField label="Display name" value={patient.name ?? ""} historyEntityId={patientId} historyField="name" onSave={(v) => updatePatientField(patientId, "name", v || null, mode)} />
              <EditableField label="First name EN" value={patient.firstNameEn ?? ""} historyEntityId={patientId} historyField="firstNameEn" onSave={(v) => updatePatientField(patientId, "firstNameEn", v || null, mode)} />
              <EditableField label="Middle name EN" value={patient.middleNameEn ?? ""} historyEntityId={patientId} historyField="middleNameEn" onSave={(v) => updatePatientField(patientId, "middleNameEn", v || null, mode)} />
              <EditableField label="Last name EN" value={patient.lastNameEn ?? ""} historyEntityId={patientId} historyField="lastNameEn" onSave={(v) => updatePatientField(patientId, "lastNameEn", v || null, mode)} />
              <EditableField label="Fourth name EN" value={patient.fourthNameEn ?? ""} historyEntityId={patientId} historyField="fourthNameEn" onSave={(v) => updatePatientField(patientId, "fourthNameEn", v || null, mode)} />
              <EditableField label="First name AR" value={patient.firstNameAr ?? ""} historyEntityId={patientId} historyField="firstNameAr" onSave={(v) => updatePatientField(patientId, "firstNameAr", v || null, mode)} />
              <EditableField label="Middle name AR" value={patient.middleNameAr ?? ""} historyEntityId={patientId} historyField="middleNameAr" onSave={(v) => updatePatientField(patientId, "middleNameAr", v || null, mode)} />
              <EditableField label="Last name AR" value={patient.lastNameAr ?? ""} historyEntityId={patientId} historyField="lastNameAr" onSave={(v) => updatePatientField(patientId, "lastNameAr", v || null, mode)} />
              <EditableField label="Fourth name AR" value={patient.fourthNameAr ?? ""} historyEntityId={patientId} historyField="fourthNameAr" onSave={(v) => updatePatientField(patientId, "fourthNameAr", v || null, mode)} />
              <EditableField label="Mother name EN" value={patient.motherNameEn ?? ""} historyEntityId={patientId} historyField="motherNameEn" onSave={(v) => updatePatientField(patientId, "motherNameEn", v || null, mode)} />
              <EditableField label="Mother name AR" value={patient.motherNameAr ?? ""} historyEntityId={patientId} historyField="motherNameAr" onSave={(v) => updatePatientField(patientId, "motherNameAr", v || null, mode)} />
              <EditableField label="Maiden name" value={patient.maidenName ?? ""} historyEntityId={patientId} historyField="maidenName" onSave={(v) => updatePatientField(patientId, "maidenName", v || null, mode)} />
              <EditableField label="Spouse name EN" value={patient.spouseNameEn ?? ""} historyEntityId={patientId} historyField="spouseNameEn" onSave={(v) => updatePatientField(patientId, "spouseNameEn", v || null, mode)} />
              <EditableField label="Spouse name AR" value={patient.spouseNameAr ?? ""} historyEntityId={patientId} historyField="spouseNameAr" onSave={(v) => updatePatientField(patientId, "spouseNameAr", v || null, mode)} />
            </div>
          </section>

          <section className="patient-profile-section">
            <h3 className="mb-2 text-sm font-semibold">Birth, sex, and status</h3>
            <div className="grid grid-cols-4 gap-3 max-[980px]:grid-cols-2 max-[560px]:grid-cols-1">
              <EditableField label="Date of birth" type="date" value={patient.dateOfBirth ?? ""} historyEntityId={patientId} historyField="dateOfBirth" onSave={(v) => updatePatientField(patientId, "dateOfBirth", v || null, mode)} />
              <InfoLine label="Calculated age" value={calculatedAge || `${patient.ageValue ?? patient.estimatedAgeRange ?? "Unknown"}${patient.ageUnit ? ` ${patient.ageUnit}` : ""}`} />
              <EditableField label="Estimated age" value={patient.ageValue != null ? String(patient.ageValue) : ""} historyEntityId={patientId} historyField="ageValue" onSave={(v) => updatePatientField(patientId, "ageValue", v ? Number(v) : null, mode)} />
              <SelectField label="Age unit" value={patient.ageUnit ?? "years"} options={["years", "months", "days"]} onSave={(v) => updatePatientField(patientId, "ageUnit", v, mode)} />
              <SelectField label="Sex" value={patient.sex ?? "unknown"} options={["male", "female", "unknown"]} onSave={(v) => updatePatientField(patientId, "sex", v, mode)} />
              <SelectField label="Sex at birth" value={patient.sexAtBirth ?? patient.sex ?? "unknown"} options={["male", "female", "unknown"]} onSave={(v) => updatePatientField(patientId, "sexAtBirth", v, mode)} />
              <EditableField label="Gender identity" value={patient.genderIdentity ?? ""} historyEntityId={patientId} historyField="genderIdentity" onSave={(v) => updatePatientField(patientId, "genderIdentity", v || null, mode)} />
              <SelectField label="Nationality" value={patient.nationality ?? ""} options={NATIONALITY_OPTIONS} placeholder="Select nationality" historyEntityId={patientId} historyField="nationality" onSave={(v) => updatePatientField(patientId, "nationality", v || null, mode)} />
              <SelectField label="Marital status" value={patient.maritalStatus ?? ""} options={MARITAL_STATUS_OPTIONS} placeholder="Select status" historyEntityId={patientId} historyField="maritalStatus" onSave={(v) => updatePatientField(patientId, "maritalStatus", v || null, mode)} />
              <SelectField label="Blood group" value={patient.bloodGroup ?? ""} options={BLOOD_GROUP_OPTIONS} placeholder="Select blood group" historyEntityId={patientId} historyField="bloodGroup" onSave={(v) => updatePatientField(patientId, "bloodGroup", v || null, mode)} />
              <SelectField label="VIP" value={patient.vip ? "yes" : "no"} options={["no", "yes"]} onSave={(v) => updatePatientField(patientId, "vip", v === "yes", mode)} />
              <EditableField label="Religion" value={patient.religion ?? ""} historyEntityId={patientId} historyField="religion" onSave={(v) => updatePatientField(patientId, "religion", v || null, mode)} />
            </div>
          </section>

          <section className="patient-profile-section">
            <h3 className="mb-2 text-sm font-semibold">Place of birth</h3>
            <div className="grid grid-cols-4 gap-3 max-[980px]:grid-cols-2 max-[560px]:grid-cols-1">
              <SelectField label="Country" value={patient.placeOfBirthCountry ?? ""} options={COUNTRY_OPTIONS} placeholder="Select country" historyEntityId={patientId} historyField="placeOfBirthCountry" onSave={(v) => updatePatientField(patientId, "placeOfBirthCountry", v || null, mode)} />
              <EditableField label="Governorate" value={patient.placeOfBirthGovernorate ?? ""} historyEntityId={patientId} historyField="placeOfBirthGovernorate" onSave={(v) => updatePatientField(patientId, "placeOfBirthGovernorate", v || null, mode)} />
              <EditableField label="District" value={patient.placeOfBirthDistrict ?? ""} historyEntityId={patientId} historyField="placeOfBirthDistrict" onSave={(v) => updatePatientField(patientId, "placeOfBirthDistrict", v || null, mode)} />
              <EditableField label="City / town" value={patient.placeOfBirthCity ?? ""} historyEntityId={patientId} historyField="placeOfBirthCity" onSave={(v) => updatePatientField(patientId, "placeOfBirthCity", v || null, mode)} />
              <EditableField label="Village" value={patient.placeOfBirthVillage ?? ""} historyEntityId={patientId} historyField="placeOfBirthVillage" onSave={(v) => updatePatientField(patientId, "placeOfBirthVillage", v || null, mode)} />
              <EditableField label="Locality" value={patient.placeOfBirthLocality ?? ""} historyEntityId={patientId} historyField="placeOfBirthLocality" onSave={(v) => updatePatientField(patientId, "placeOfBirthLocality", v || null, mode)} />
            </div>
          </section>

          <section className="patient-profile-section">
            <h3 className="mb-2 text-sm font-semibold">Arrival and ER encounter</h3>
            <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
              <SelectField label="Arrival method" value={encounter.arrivalMethod ?? "walk_in"} options={["walk_in", "ambulance", "transfer", "police", "other"]} onSave={(v) => updateEncounterField(encounterId, "arrivalMethod", v, mode)} />
              <EditableField label="Referral source" value={encounter.referralSource ?? ""} onSave={(v) => updateEncounterField(encounterId, "referralSource", v || null, mode)} />
            </div>
            <div className="mt-3">
              <TextAreaField label="Chief complaint" value={encounter.chiefComplaint ?? ""} onSave={(v) => updateEncounterField(encounterId, "chiefComplaint", v || null, mode)} />
            </div>
          </section>
        </div>
      )}

      {detailsSection === "Contact & Address" && (
        <div className="space-y-3">
          <section className="patient-profile-section">
            <h3 className="mb-2 text-sm font-semibold">Contact information</h3>
            <div className="grid grid-cols-4 gap-3 max-[980px]:grid-cols-2 max-[560px]:grid-cols-1">
              <EditableField label="Primary mobile" value={patient.phone ?? ""} historyEntityId={patientId} historyField="phone" onSave={(v) => updatePatientField(patientId, "phone", normalizePhone(v) || null, mode)} />
              <EditableField label="Secondary mobile" value={patient.mobileSecondary ?? ""} historyEntityId={patientId} historyField="mobileSecondary" onSave={(v) => updatePatientField(patientId, "mobileSecondary", normalizePhone(v) || null, mode)} />
              <EditableField label="Home phone" value={patient.homePhone ?? ""} historyEntityId={patientId} historyField="homePhone" onSave={(v) => updatePatientField(patientId, "homePhone", normalizePhone(v) || null, mode)} />
              <EditableField label="Work phone" value={patient.workPhone ?? ""} historyEntityId={patientId} historyField="workPhone" onSave={(v) => updatePatientField(patientId, "workPhone", normalizePhone(v) || null, mode)} />
              <EditableField label="Email" type="email" value={patient.email ?? ""} historyEntityId={patientId} historyField="email" onSave={(v) => updatePatientField(patientId, "email", v || null, mode)} />
              <EditableField label="Fax" value={patient.fax ?? ""} historyEntityId={patientId} historyField="fax" onSave={(v) => updatePatientField(patientId, "fax", normalizePhone(v) || null, mode)} />
              <SelectField label="Preferred contact" value={patient.preferredContactMethod ?? "mobile"} options={["mobile", "home_phone", "work_phone", "email", "sms", "none"]} onSave={(v) => updatePatientField(patientId, "preferredContactMethod", v, mode)} />
              <SelectField label="Preferred language" value={patient.preferredLanguage ?? ""} options={LANGUAGE_OPTIONS} placeholder="Select language" historyEntityId={patientId} historyField="preferredLanguage" onSave={(v) => updatePatientField(patientId, "preferredLanguage", v || null, mode)} />
            </div>
          </section>

          <section className="patient-profile-section">
            <h3 className="mb-2 text-sm font-semibold">Primary address</h3>
            <div className="grid grid-cols-4 gap-3 max-[980px]:grid-cols-2 max-[560px]:grid-cols-1">
              <SelectField label="Country" value={patient.addressCountry ?? ""} options={COUNTRY_OPTIONS} placeholder="Select country" historyEntityId={patientId} historyField="addressCountry" onSave={(v) => updatePatientField(patientId, "addressCountry", v || null, mode)} />
              <EditableField label="Governorate" value={patient.addressGovernorate ?? ""} historyEntityId={patientId} historyField="addressGovernorate" onSave={(v) => updatePatientField(patientId, "addressGovernorate", v || null, mode)} />
              <EditableField label="District" value={patient.addressDistrict ?? ""} historyEntityId={patientId} historyField="addressDistrict" onSave={(v) => updatePatientField(patientId, "addressDistrict", v || null, mode)} />
              <EditableField label="City / town" value={patient.addressCity ?? patient.city ?? ""} historyEntityId={patientId} historyField="addressCity" onSave={(v) => updatePatientField(patientId, "addressCity", v || null, mode)} />
              <EditableField label="Village" value={patient.addressVillage ?? ""} historyEntityId={patientId} historyField="addressVillage" onSave={(v) => updatePatientField(patientId, "addressVillage", v || null, mode)} />
              <EditableField label="Zone / neighborhood" value={patient.addressZone ?? ""} historyEntityId={patientId} historyField="addressZone" onSave={(v) => updatePatientField(patientId, "addressZone", v || null, mode)} />
              <EditableField label="Area" value={patient.addressArea ?? ""} historyEntityId={patientId} historyField="addressArea" onSave={(v) => updatePatientField(patientId, "addressArea", v || null, mode)} />
              <EditableField label="Street" value={patient.addressStreet ?? ""} historyEntityId={patientId} historyField="addressStreet" onSave={(v) => updatePatientField(patientId, "addressStreet", v || null, mode)} />
              <EditableField label="Building" value={patient.addressBuilding ?? ""} historyEntityId={patientId} historyField="addressBuilding" onSave={(v) => updatePatientField(patientId, "addressBuilding", v || null, mode)} />
              <EditableField label="Floor" value={patient.addressFloor ?? ""} historyEntityId={patientId} historyField="addressFloor" onSave={(v) => updatePatientField(patientId, "addressFloor", v || null, mode)} />
              <EditableField label="Additional directions" value={patient.addressAdditionalDetails ?? patient.address ?? ""} historyEntityId={patientId} historyField="addressAdditionalDetails" onSave={(v) => updatePatientField(patientId, "addressAdditionalDetails", v || null, mode)} />
            </div>
          </section>
        </div>
      )}

      {detailsSection === "Family & Emergency" && <RelatedPersonsSection patientId={patientId} mode={mode} readOnly={!editing} />}
      {detailsSection === "Insurance" && <InsurancePoliciesSection patientId={patientId} mode={mode} readOnly={!editing} />}
      {detailsSection === "Civil Registry & IDs" && (
        <div className="space-y-3">
          <section className="patient-profile-section">
            <h3 className="mb-2 text-sm font-semibold">Civil registry</h3>
            <div className="grid grid-cols-4 gap-3 max-[980px]:grid-cols-2 max-[560px]:grid-cols-1">
              <EditableField label="Sijil number / رقم السجل" value={civilRegistry?.sijilNumber ?? ""} onSave={(v) => upsertCivilRegistryRecord(patientId, { sijilNumber: v || null }, mode)} />
              <EditableField label="Sahifa number / رقم الصحيفة" value={civilRegistry?.sahifaNumber ?? ""} onSave={(v) => upsertCivilRegistryRecord(patientId, { sahifaNumber: v || null }, mode)} />
              <EditableField label="Daira / الدائرة" value={civilRegistry?.daira ?? ""} onSave={(v) => upsertCivilRegistryRecord(patientId, { daira: v || null }, mode)} />
              <SelectField label="Registry country" value={civilRegistry?.registryCountry ?? ""} options={COUNTRY_OPTIONS} placeholder="Select country" onSave={(v) => upsertCivilRegistryRecord(patientId, { registryCountry: v || null }, mode)} />
              <EditableField label="Registry governorate" value={civilRegistry?.registryGovernorate ?? ""} onSave={(v) => upsertCivilRegistryRecord(patientId, { registryGovernorate: v || null }, mode)} />
              <EditableField label="Registry district" value={civilRegistry?.registryDistrict ?? ""} onSave={(v) => upsertCivilRegistryRecord(patientId, { registryDistrict: v || null }, mode)} />
              <EditableField label="Registry locality" value={civilRegistry?.registryLocality ?? ""} onSave={(v) => upsertCivilRegistryRecord(patientId, { registryLocality: v || null }, mode)} />
              <EditableField label="Registry notes" value={civilRegistry?.registryNotes ?? ""} onSave={(v) => upsertCivilRegistryRecord(patientId, { registryNotes: v || null }, mode)} />
            </div>
          </section>
          <IdentifiersSection patientId={patientId} mode={mode} readOnly={!editing} />
        </div>
      )}
      {detailsSection === "Employment" && (
        <section className="patient-profile-section">
          <h3 className="mb-2 text-sm font-semibold">Employment</h3>
          <div className="grid grid-cols-4 gap-3 max-[980px]:grid-cols-2 max-[560px]:grid-cols-1">
            <EditableField label="Occupation" value={employment?.occupation ?? ""} onSave={(v) => upsertEmploymentRecord(patientId, { occupation: v || null }, mode)} />
            <SelectField label="Employment status" value={employment?.employmentStatus ?? ""} options={EMPLOYMENT_STATUS_OPTIONS} placeholder="Select status" onSave={(v) => upsertEmploymentRecord(patientId, { employmentStatus: v || null }, mode)} />
            <EditableField label="Employer" value={employment?.employer ?? ""} onSave={(v) => upsertEmploymentRecord(patientId, { employer: v || null }, mode)} />
            <EditableField label="Job title" value={employment?.jobTitle ?? ""} onSave={(v) => upsertEmploymentRecord(patientId, { jobTitle: v || null }, mode)} />
            <EditableField label="Work phone" value={employment?.workPhone ?? ""} onSave={(v) => upsertEmploymentRecord(patientId, { workPhone: normalizePhone(v) || null }, mode)} />
            <EditableField label="Work address" value={employment?.workAddress ?? ""} onSave={(v) => upsertEmploymentRecord(patientId, { workAddress: v || null }, mode)} />
            <SelectField label="Industry" value={employment?.industry ?? ""} options={EMPLOYMENT_INDUSTRY_OPTIONS} placeholder="Select industry" onSave={(v) => upsertEmploymentRecord(patientId, { industry: v || null }, mode)} />
            <EditableField label="Notes" value={employment?.notes ?? ""} onSave={(v) => upsertEmploymentRecord(patientId, { notes: v || null }, mode)} />
          </div>
        </section>
      )}
      {detailsSection === "Military" && (
        <section className="patient-profile-section">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Military / security information</h3>
              <p className="text-sm text-[var(--color-ink-secondary)]">Optional sensitive section. Access control can be wired to a future auth layer.</p>
            </div>
            {editing && (
              <button type="button" onClick={() => void upsertMilitaryRecord(patientId, { enabled: !militaryEnabled }, mode)} className="min-h-10 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold">
                {militaryEnabled ? "Hide section" : "Enable section"}
              </button>
            )}
          </div>
          {militaryEnabled ? (
            <div className="grid grid-cols-3 gap-3 max-[860px]:grid-cols-2 max-[560px]:grid-cols-1">
              <SelectField label="Institution" value={military?.institution ?? ""} options={MILITARY_INSTITUTION_OPTIONS} placeholder="Select institution" onSave={(v) => upsertMilitaryRecord(patientId, { institution: v || null, enabled: true }, mode)} />
              <SelectField label="Section / department" value={military?.section ?? ""} options={MILITARY_SECTION_OPTIONS} placeholder="Select department" onSave={(v) => upsertMilitaryRecord(patientId, { section: v || null, enabled: true }, mode)} />
              <SelectField label="Position or rank" value={military?.positionOrRank ?? ""} options={MILITARY_RANK_OPTIONS} placeholder="Select rank" onSave={(v) => upsertMilitaryRecord(patientId, { positionOrRank: v || null, enabled: true }, mode)} />
              <EditableField label="Service number" value={military?.serviceNumber ?? ""} onSave={(v) => upsertMilitaryRecord(patientId, { serviceNumber: v || null, enabled: true }, mode)} />
              <SelectField label="Zone" value={military?.zone ?? ""} options={MILITARY_ZONE_OPTIONS} placeholder="Select zone" onSave={(v) => upsertMilitaryRecord(patientId, { zone: v || null, enabled: true }, mode)} />
              <EditableField label="Notes" value={military?.notes ?? ""} onSave={(v) => upsertMilitaryRecord(patientId, { notes: v || null, enabled: true }, mode)} />
            </div>
          ) : (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink-secondary)]">
              No military or security affiliation recorded.
            </div>
          )}
        </section>
      )}
      {detailsSection === "Registrations" && <PatientVisits patientId={patientId} currentEncounterId={encounterId} />}
      {detailsSection === "Pending Cases" && <PendingCasesSection patientId={patientId} />}

      {patient.registrationComplete === false && (
        <button
          type="button"
          onClick={() => void completeRegistration(patientId, {}, encounterId, mode)}
          className="inline-flex min-h-10 items-center rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white"
        >
          Mark registration complete
        </button>
      )}

      {editing && (
        <div className="sticky bottom-3 z-20 ml-auto flex w-fit items-center gap-2 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-2 shadow-lg">
          <span className="px-1 text-sm text-[var(--color-ink-secondary)]">{dirty ? `${Object.keys(drafts).length} unsaved` : "No unsaved changes"}</span>
          <button type="button" onClick={cancelEditing} className="min-h-10 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void saveChanges()}
            disabled={!dirty || saving}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Save size={16} /> {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      )}
    </div>
    </PersonalEditContext.Provider>
  );
}

function RelatedPersonsSection({ patientId, mode, readOnly }: { patientId: string; mode: ReturnType<typeof useAppStore.getState>["mode"]; readOnly: boolean }) {
  const rows = useRelatedPersons(patientId);
  return (
    <DomainTab<RelatedPerson, Record<string, string>>
      title="Family and emergency contacts"
      subtitle="Next of kin, spouse, guardian, authorized representative, and secondary references."
      readOnly={readOnly}
      rows={rows}
      addLabel="Add contact"
      columns={[
        { header: "Name", primary: true, render: (r) => r.fullName },
        { header: "Relationship", render: (r) => r.relationship ?? "-" },
        { header: "Phone", render: (r) => r.mobilePrimary ?? "-" },
        { header: "Role", render: (r) => contactRoles(r).join(", ") || "Reference" },
        { header: "Priority", render: (r) => r.contactPriority ?? "-" },
      ]}
      fields={[
        { key: "fullName", label: "Full name", required: true, span: 2 },
        { key: "englishName", label: "English name" },
        { key: "arabicName", label: "Arabic name" },
        { key: "relationship", label: "Relationship", type: "select", options: RELATIONSHIP_OPTIONS, placeholder: "Select relationship" },
        { key: "mobilePrimary", label: "Primary phone" },
        { key: "mobileSecondary", label: "Secondary phone" },
        { key: "email", label: "Email" },
        { key: "address", label: "Address" },
        { key: "nationalId", label: "National ID" },
        { key: "contactPriority", label: "Priority", type: "number" },
        { key: "role", label: "Role", type: "select", options: ["secondary_reference", "next_of_kin", "spouse", "parent", "legal_guardian", "authorized_representative", "emergency_contact"] },
        { key: "notes", label: "Notes", type: "textarea", span: 2 },
      ]}
      emptyDraft={{ fullName: "", englishName: "", arabicName: "", relationship: "", mobilePrimary: "", mobileSecondary: "", email: "", address: "", nationalId: "", contactPriority: "", role: "secondary_reference", notes: "" }}
      toDraft={(r) => ({
        fullName: r.fullName,
        englishName: r.englishName ?? "",
        arabicName: r.arabicName ?? "",
        relationship: r.relationship ?? "",
        mobilePrimary: r.mobilePrimary ?? "",
        mobileSecondary: r.mobileSecondary ?? "",
        email: r.email ?? "",
        address: r.address ?? "",
        nationalId: r.nationalId ?? "",
        contactPriority: r.contactPriority != null ? String(r.contactPriority) : "",
        role: roleForContact(r),
        notes: r.notes ?? "",
      })}
      onAdd={(d) => addRelatedPerson(relatedPersonFromDraft(patientId, d), mode)}
      onUpdate={(id, d) => updateRelatedPerson(id, relatedPersonFromDraft(patientId, d), mode)}
      onRemove={(id) => removeRelatedPerson(id, mode)}
      minTableWidth={780}
    />
  );
}

function InsurancePoliciesSection({ patientId, mode, readOnly }: { patientId: string; mode: ReturnType<typeof useAppStore.getState>["mode"]; readOnly: boolean }) {
  const rows = useInsurancePolicies(patientId);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <DomainTab<InsurancePolicy, Record<string, string>>
      title="Insurance policies"
      subtitle="Optional for ER care. Expired policies remain visible as history."
      readOnly={readOnly}
      rows={rows}
      addLabel="Add policy"
      columns={[
        { header: "Payer", primary: true, render: (r) => r.payerName },
        { header: "Plan", render: (r) => r.plan ?? "-" },
        { header: "Policy", render: (r) => r.policyNumber ?? r.membershipNumber ?? "-" },
        { header: "Expiry", render: (r) => r.expiryDate ? <StatusPill label={r.expiryDate < today ? `Expired ${r.expiryDate}` : r.expiryDate} tone={r.expiryDate < today ? "red" : "neutral"} /> : "-" },
        { header: "Default", render: (r) => r.isDefault ? <StatusPill label="Default" tone="primary" /> : "-" },
      ]}
      fields={[
        { key: "payerName", label: "Payer", required: true, type: "select", options: INSURANCE_PAYER_OPTIONS, placeholder: "Select payer" },
        { key: "plan", label: "Plan", type: "select", options: INSURANCE_PLAN_OPTIONS, placeholder: "Select plan" },
        { key: "membershipNumber", label: "Membership number" },
        { key: "policyNumber", label: "Policy number" },
        { key: "coverageClass", label: "Coverage class", type: "select", options: INSURANCE_COVERAGE_CLASS_OPTIONS, placeholder: "Select coverage class" },
        { key: "subscriberRelationship", label: "Subscriber relationship", type: "select", options: ["Self", ...RELATIONSHIP_OPTIONS], placeholder: "Select relationship" },
        { key: "subscriberName", label: "Subscriber name" },
        { key: "subscriberId", label: "Subscriber ID" },
        { key: "effectiveDate", label: "Effective date", type: "date" },
        { key: "expiryDate", label: "Expiry date", type: "date" },
        { key: "isDefault", label: "Default policy", type: "select", options: ["no", "yes"] },
        { key: "approvalRequired", label: "Approval required", type: "select", options: ["no", "yes"] },
        { key: "notes", label: "Notes", type: "textarea", span: 2 },
      ]}
      emptyDraft={{ payerName: "", plan: "", membershipNumber: "", policyNumber: "", coverageClass: "", subscriberRelationship: "", subscriberName: "", subscriberId: "", effectiveDate: "", expiryDate: "", isDefault: "no", approvalRequired: "no", notes: "" }}
      toDraft={(r) => ({
        payerName: r.payerName,
        plan: r.plan ?? "",
        membershipNumber: r.membershipNumber ?? "",
        policyNumber: r.policyNumber ?? "",
        coverageClass: r.coverageClass ?? "",
        subscriberRelationship: r.subscriberRelationship ?? "",
        subscriberName: r.subscriberName ?? "",
        subscriberId: r.subscriberId ?? "",
        effectiveDate: r.effectiveDate ?? "",
        expiryDate: r.expiryDate ?? "",
        isDefault: r.isDefault ? "yes" : "no",
        approvalRequired: r.approvalRequired ? "yes" : "no",
        notes: r.notes ?? "",
      })}
      onAdd={(d) => addInsurancePolicy(insuranceFromDraft(patientId, d), mode)}
      onUpdate={(id, d) => updateInsurancePolicy(id, insuranceFromDraft(patientId, d), mode)}
      onRemove={(id) => removeInsurancePolicy(id, mode)}
      minTableWidth={840}
    />
  );
}

function IdentifiersSection({ patientId, mode, readOnly }: { patientId: string; mode: ReturnType<typeof useAppStore.getState>["mode"]; readOnly: boolean }) {
  const rows = usePatientIdentifiers(patientId);
  return (
    <DomainTab<PatientIdentifier, Record<string, string>>
      title="Identifiers"
      subtitle="National ID, passport, civil card, UNRWA card, military number, legacy MRN, and other configured IDs."
      readOnly={readOnly}
      rows={rows}
      addLabel="Add identifier"
      columns={[
        { header: "Type", render: (r) => <StatusPill label={r.type} tone={r.isPrimary ? "primary" : "neutral"} /> },
        { header: "Value", primary: true, render: (r) => r.value },
        { header: "Country", render: (r) => r.issuingCountry ?? "-" },
        { header: "Expiry", render: (r) => r.expiryDate ?? "-" },
        { header: "Verification", render: (r) => r.verificationStatus ?? "unverified" },
      ]}
      fields={[
        { key: "type", label: "Identifier type", type: "select", options: ["national_id", "passport", "civil_card", "unrwa_card", "ration_card", "military_number", "legacy_mrn", "other"] },
        { key: "value", label: "Value", required: true },
        { key: "issuingCountry", label: "Issuing country", type: "select", options: COUNTRY_OPTIONS, placeholder: "Select country" },
        { key: "issueDate", label: "Issue date", type: "date" },
        { key: "expiryDate", label: "Expiry date", type: "date" },
        { key: "isPrimary", label: "Primary", type: "select", options: ["no", "yes"] },
        { key: "verificationStatus", label: "Verification", type: "select", options: ["unverified", "verified", "rejected", "expired"] },
        { key: "verifiedBy", label: "Verified by" },
        { key: "notes", label: "Notes", type: "textarea", span: 2 },
      ]}
      emptyDraft={{ type: "national_id", value: "", issuingCountry: "", issueDate: "", expiryDate: "", isPrimary: "no", verificationStatus: "unverified", verifiedBy: "", notes: "" }}
      toDraft={(r) => ({
        type: r.type,
        value: r.value,
        issuingCountry: r.issuingCountry ?? "",
        issueDate: r.issueDate ?? "",
        expiryDate: r.expiryDate ?? "",
        isPrimary: r.isPrimary ? "yes" : "no",
        verificationStatus: r.verificationStatus ?? "unverified",
        verifiedBy: r.verifiedBy ?? "",
        notes: r.notes ?? "",
      })}
      onAdd={(d) => addPatientIdentifier(identifierFromDraft(patientId, d), mode)}
      onUpdate={(id, d) => updatePatientIdentifier(id, identifierFromDraft(patientId, d), mode)}
      onRemove={(id) => removePatientIdentifier(id, mode)}
      minTableWidth={760}
    />
  );
}

function PendingCasesSection({ patientId }: { patientId: string }) {
  const rows = usePendingCases(patientId);
  return (
    <section className="patient-profile-section">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Pending cases</h3>
          <p className="text-sm text-[var(--color-ink-secondary)]">Read-only operational queue after registration.</p>
        </div>
        <span className="rounded-md bg-[var(--color-surface)] px-2.5 py-1 text-sm font-semibold">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink-secondary)]">No pending cases.</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] max-[720px]:hidden">
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-left">
                  <th className="px-3 py-2">Case</th>
                  <th className="px-3 py-2">Request</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2">Waiting</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-2 font-semibold">{row.caseNumber}</td>
                    <td className="px-3 py-2">{row.requestNumber ?? "-"}</td>
                    <td className="px-3 py-2">{row.requestType}</td>
                    <td className="px-3 py-2"><StatusPill label={row.pendingStatus} tone="yellow" /></td>
                    <td className="px-3 py-2">{row.responsibleDepartment ?? "-"}</td>
                    <td className="px-3 py-2">{row.assignedOwner ?? "-"}</td>
                    <td className="px-3 py-2">{formatWaiting(row.requestDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hidden space-y-2 max-[720px]:block">
            {rows.map((row) => (
              <article key={row.id} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <strong>{row.caseNumber}</strong>
                  <StatusPill label={row.pendingStatus} tone="yellow" />
                  <span className="ml-auto font-semibold tabular-nums">{formatWaiting(row.requestDate)}</span>
                </div>
                <div className="font-semibold">{row.requestType}</div>
                <div className="mt-1 break-words text-[var(--color-ink-secondary)]">
                  {row.requestNumber ?? "No request number"} · {row.responsibleDepartment ?? "Department unassigned"} · {row.assignedOwner ?? "Owner unassigned"}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function relatedPersonFromDraft(patientId: string, d: Record<string, string>): Omit<RelatedPerson, "id" | "createdAt" | "updatedAt"> {
  return {
    patientId,
    fullName: d.fullName,
    englishName: d.englishName || null,
    arabicName: d.arabicName || null,
    relationship: d.relationship || null,
    mobilePrimary: normalizePhone(d.mobilePrimary) || null,
    mobileSecondary: normalizePhone(d.mobileSecondary) || null,
    email: d.email || null,
    address: d.address || null,
    nationalId: d.nationalId || null,
    isEmergencyContact: d.role === "emergency_contact" || d.role === "next_of_kin" || d.role === "spouse" || d.role === "legal_guardian",
    isNextOfKin: d.role === "next_of_kin",
    isSpouse: d.role === "spouse",
    isParent: d.role === "parent",
    isLegalGuardian: d.role === "legal_guardian",
    isAuthorizedRepresentative: d.role === "authorized_representative",
    preferredContactMethod: "mobile",
    contactPriority: d.contactPriority ? Number(d.contactPriority) : null,
    notes: d.notes || null,
  };
}

function insuranceFromDraft(patientId: string, d: Record<string, string>): Omit<InsurancePolicy, "id" | "createdAt" | "updatedAt"> {
  return {
    patientId,
    payerId: null,
    payerName: d.payerName,
    plan: d.plan || null,
    membershipNumber: d.membershipNumber || null,
    policyNumber: d.policyNumber || null,
    coverageClass: d.coverageClass || null,
    subscriberRelationship: d.subscriberRelationship || null,
    subscriberName: d.subscriberName || null,
    subscriberId: d.subscriberId || null,
    effectiveDate: d.effectiveDate || null,
    expiryDate: d.expiryDate || null,
    isDefault: d.isDefault === "yes",
    approvalRequired: d.approvalRequired === "yes",
    notes: d.notes || null,
    cardImageBlob: null,
  };
}

function identifierFromDraft(patientId: string, d: Record<string, string>): Omit<PatientIdentifier, "id" | "createdAt"> {
  return {
    patientId,
    type: d.type as IdentifierType,
    value: d.value,
    issuingCountry: d.issuingCountry || null,
    issueDate: d.issueDate || null,
    expiryDate: d.expiryDate || null,
    isPrimary: d.isPrimary === "yes",
    verificationStatus: d.verificationStatus || "unverified",
    verifiedBy: d.verifiedBy || null,
    verificationDate: d.verificationStatus === "verified" ? new Date().toISOString().slice(0, 10) : null,
    frontImageBlob: null,
    backImageBlob: null,
    notes: d.notes || null,
  };
}

function contactRoles(row: RelatedPerson) {
  return [
    row.isNextOfKin ? "Next of kin" : null,
    row.isSpouse ? "Spouse" : null,
    row.isParent ? "Parent" : null,
    row.isLegalGuardian ? "Guardian" : null,
    row.isAuthorizedRepresentative ? "Representative" : null,
    row.isEmergencyContact ? "Emergency" : null,
  ].filter(Boolean) as string[];
}

function roleForContact(row: RelatedPerson) {
  if (row.isNextOfKin) return "next_of_kin";
  if (row.isSpouse) return "spouse";
  if (row.isParent) return "parent";
  if (row.isLegalGuardian) return "legal_guardian";
  if (row.isAuthorizedRepresentative) return "authorized_representative";
  if (row.isEmergencyContact) return "emergency_contact";
  return "secondary_reference";
}

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, " ").replace(/\s+/g, " ").trim();
}

function formatWaiting(timestamp: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours}h ${rem}m`;
}

function FieldLabel({
  label,
  htmlFor,
  historyCount,
  onHistory,
}: {
  label: string;
  htmlFor?: string;
  historyCount?: number;
  onHistory?: () => void;
}) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-xs font-semibold text-[var(--color-ink-secondary)]">{label}</label>
      ) : (
        <span className="text-xs font-semibold text-[var(--color-ink-secondary)]">{label}</span>
      )}
      {onHistory && (
        <button type="button" onClick={onHistory} className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)]" title={`${historyCount ?? 0} field changes`} aria-label={`View ${label} history`}>
          <Clock3 size={14} />
        </button>
      )}
    </div>
  );
}

function usePersonalField(label: string, value: string, onSave: SaveFn, fieldKey?: string) {
  const context = useContext(PersonalEditContext);
  const key = `${context?.scope ?? "personal"}:${fieldKey ?? label}`;
  const currentValue = context?.drafts[key]?.value ?? value;

  function setCurrentValue(nextValue: string) {
    if (context) context.stageField(key, value, nextValue, onSave);
    else void onSave(nextValue);
  }

  return { editing: context?.editing ?? true, currentValue, setCurrentValue };
}

function FieldHistory({ open, audits }: { open: boolean; audits: ReturnType<typeof useAuditEvents> }) {
  if (!open) return null;
  return (
    <div className="mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2 text-xs">
      {audits.length === 0 ? (
        <span className="text-[var(--color-ink-secondary)]">No field changes recorded.</span>
      ) : (
        audits.slice(0, 4).map((audit) => (
          <div key={audit.id} className="border-b border-[var(--color-border)] py-1 last:border-0">
            {audit.previousValue || "—"} → {audit.newValue || "—"} · {new Date(audit.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        ))
      )}
    </div>
  );
}

function EditableField({
  label,
  value,
  onSave,
  type = "text",
  historyEntityId,
  historyField,
}: {
  label: string;
  value: string;
  onSave: SaveFn;
  type?: string;
  historyEntityId?: string;
  historyField?: string;
}) {
  const inputId = useId();
  const [historyOpen, setHistoryOpen] = useState(false);
  const { editing, currentValue, setCurrentValue } = usePersonalField(label, value, onSave, historyField);
  const audits = useAuditEvents(historyEntityId);
  const fieldAudits = historyField ? audits.filter((audit) => audit.action === `field_updated:${historyField}`) : [];

  return (
    <div className="min-w-0">
      <FieldLabel label={label} htmlFor={editing ? inputId : undefined} historyCount={fieldAudits.length} onHistory={historyField ? () => setHistoryOpen((open) => !open) : undefined} />
      {editing ? (
        <input
          id={inputId}
          type={type}
          value={currentValue}
          onChange={(event) => setCurrentValue(event.target.value)}
          className="min-h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] px-2.5 text-sm outline-none"
        />
      ) : (
        <div className="min-h-6 break-words text-sm font-medium">{currentValue.trim() || "—"}</div>
      )}
      <FieldHistory open={historyOpen} audits={fieldAudits} />
    </div>
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
  const inputId = useId();
  const { editing, currentValue, setCurrentValue } = usePersonalField(label, value, onSave);

  return (
    <div className="min-w-0">
      <FieldLabel label={label} htmlFor={editing ? inputId : undefined} />
      {editing ? (
        <textarea
          id={inputId}
          value={currentValue}
          onChange={(event) => setCurrentValue(event.target.value)}
          rows={3}
          className="w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] p-2.5 text-sm outline-none"
        />
      ) : (
        <div className="min-h-6 whitespace-pre-wrap break-words text-sm font-medium">{currentValue.trim() || "—"}</div>
      )}
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  placeholder,
  onSave,
  historyEntityId,
  historyField,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder?: string;
  onSave: SaveFn;
  historyEntityId?: string;
  historyField?: string;
}) {
  const inputId = useId();
  const [historyOpen, setHistoryOpen] = useState(false);
  const { editing, currentValue, setCurrentValue } = usePersonalField(label, value, onSave, historyField);
  const audits = useAuditEvents(historyEntityId);
  const fieldAudits = historyField ? audits.filter((audit) => audit.action === `field_updated:${historyField}`) : [];
  const selectOptions = currentValue && !options.includes(currentValue) ? [currentValue, ...options] : options;

  return (
    <div className="min-w-0">
      <FieldLabel label={label} htmlFor={editing ? inputId : undefined} historyCount={fieldAudits.length} onHistory={historyField ? () => setHistoryOpen((open) => !open) : undefined} />
      {editing ? (
        <select
          id={inputId}
          value={currentValue}
          onChange={(event) => setCurrentValue(event.target.value)}
          className="min-h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] px-2.5 text-sm capitalize outline-none"
        >
          {placeholder && <option value="">{placeholder}</option>}
          {selectOptions.map((option) => (
            <option key={option} value={option}>
              {option.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      ) : (
        <div className="min-h-6 break-words text-sm font-medium capitalize">{currentValue ? currentValue.replace(/_/g, " ") : "—"}</div>
      )}
      <FieldHistory open={historyOpen} audits={fieldAudits} />
    </div>
  );
}

function VitalsTab({ encounterId, sets }: { encounterId: string; sets: ReturnType<typeof useVitalsSets> }) {
  const [recording, setRecording] = useState(false);
  return (
    <div className="space-y-3">
      <CurrentVitalsSummary sets={sets} recording={recording} onRecord={() => setRecording((open) => !open)} />
      {recording && <VitalsCaptureForm encounterId={encounterId} source="full" onSaved={() => setRecording(false)} />}
      <div id="vitals-history"><VitalsFlowsheet sets={sets} /></div>
    </div>
  );
}

function TriageTab({
  encounterId,
  currentLevel,
  latest,
}: {
  encounterId: string;
  currentLevel: EsiLevel | string | number | null;
  latest: ReturnType<typeof latestVitals>;
}) {
  const mode = useAppStore((s) => s.mode);
  const view = useEncounterView(encounterId);
  const beds = useBeds();
  const zones = useZones();
  const levels: EsiLevel[] = [1, 2, 3, 4, 5];
  const currentEsi: EsiLevel | null =
    typeof currentLevel === "number" && levels.includes(currentLevel as EsiLevel) ? currentLevel as EsiLevel : null;
  const availableBeds = beds.filter((bed) => !bed.encounterId);
  const zonesById = new Map(zones.map((zone) => [zone.id, zone]));

  // Bed and ESI selections are staged, not saved on click - the nurse must
  // review and press Confirm before either is written.
  const [pendingBed, setPendingBed] = useState<{ id: string; name: string; zoneId: string } | null>(null);
  const [pendingEsi, setPendingEsi] = useState<EsiLevel | null>(null);
  const [savingBed, setSavingBed] = useState(false);
  const [savingEsi, setSavingEsi] = useState(false);
  const [vitalsOpen, setVitalsOpen] = useState(true);
  const [bedSearch, setBedSearch] = useState("");
  const [bedZoneFilter, setBedZoneFilter] = useState("all");

  const selectedEsi = pendingEsi ?? currentEsi;
  const currentPathway = view?.encounter.pathway ?? "standard";
  const currentLocation = view?.encounter.currentLocationName ?? "Unassigned";
  const currentZoneName = view?.encounter.currentZone ? zonesById.get(view.encounter.currentZone)?.name : null;
  const availableZoneIds = new Set(availableBeds.map((bed) => bed.zone));
  const availableZones = zones.filter((zone) => availableZoneIds.has(zone.id));
  const normalizedBedSearch = bedSearch.trim().toLowerCase();
  const filteredBeds = availableBeds.filter((bed) => {
    const zoneName = zonesById.get(bed.zone)?.name ?? "Unzoned";
    const matchesZone = bedZoneFilter === "all" || bed.zone === bedZoneFilter;
    const matchesSearch = !normalizedBedSearch || `${bed.name} ${bed.zone} ${zoneName}`.toLowerCase().includes(normalizedBedSearch);
    return matchesZone && matchesSearch;
  });
  const triageVitalsFormId = `triage-vitals-${encounterId}`;
  const pathways = [
    { value: "fast_track" as const, label: "Fast-track", description: "Stable minor case", reason: "Low-risk patient assigned to fast-track" },
    { value: "standard" as const, label: "Main ER", description: "Standard treatment queue", reason: "Moved to main ER pathway" },
    { value: "critical" as const, label: "Resuscitation", description: "Immediate critical-care pathway", reason: "Deterioration: move to resuscitation" },
  ];

  async function confirmBed() {
    if (!pendingBed) return;
    setSavingBed(true);
    try {
      await assignLocation(encounterId, pendingBed.name, pendingBed.zoneId, mode);
      const previousBeds = await db.beds.where("encounterId").equals(encounterId).toArray();
      await Promise.all([
        ...previousBeds.map((bed) => db.beds.update(bed.id, { encounterId: null })),
        db.beds.update(pendingBed.id, { encounterId }),
      ]);
      setPendingBed(null);
    } finally {
      setSavingBed(false);
    }
  }

  async function confirmEsi() {
    if (pendingEsi === null) return;
    setSavingEsi(true);
    try {
      await setTriage(encounterId, "esi", pendingEsi, mode);
      setPendingEsi(null);
    } finally {
      setSavingEsi(false);
    }
  }

  return (
    <div className="triage-workspace">
      <section className="triage-section triage-section-primary">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-sm font-semibold">ESI triage</h2>
          <TriageVitalsAdvisory latest={latest} />
        </div>

        <div role="radiogroup" aria-label="ESI triage level" className="triage-esi-grid">
          {levels.map((level, index) => {
            const selected = selectedEsi === level;
            const palette = triagePalette(level);
            return (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected || (selectedEsi === null && index === 0) ? 0 : -1}
                aria-label={`ESI ${level}: ${ESI_DESCRIPTIONS[level]}`}
                title={ESI_DESCRIPTIONS[level]}
                onClick={() => setPendingEsi(level)}
                onKeyDown={(event) => {
                  const previous = event.key === "ArrowLeft" || event.key === "ArrowUp";
                  const next = event.key === "ArrowRight" || event.key === "ArrowDown";
                  if (!previous && !next && event.key !== "Home" && event.key !== "End") return;
                  event.preventDefault();
                  const nextIndex = event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? levels.length - 1
                      : (index + (previous ? -1 : 1) + levels.length) % levels.length;
                  setPendingEsi(levels[nextIndex]);
                  const choices = event.currentTarget.parentElement?.children;
                  window.setTimeout(() => (choices?.[nextIndex] as HTMLElement | undefined)?.focus(), 0);
                }}
                style={selected ? { borderColor: palette.solid, background: palette.tint } : undefined}
                className="flex min-h-[52px] min-w-0 items-center gap-2 rounded-md border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-left hover:bg-[var(--color-surface-muted)]"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-base font-bold tabular-nums"
                  style={selected ? { background: palette.solid, color: palette.textOnSolid } : { background: "var(--color-surface-muted)" }}
                >
                  {level}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">ESI {level}</span>
                  <span className="block truncate text-xs text-[var(--color-ink-secondary)]">{ESI_SHORT_LABELS[level]}</span>
                </span>
                {selected && <CheckCircle2 size={16} className="shrink-0" style={{ color: palette.text }} />}
              </button>
            );
          })}
        </div>

        <div className="flex min-h-9 flex-wrap items-center gap-2 rounded-md bg-[var(--color-surface-muted)] px-2 py-1">
          <span className="min-w-[240px] flex-1 truncate text-sm" aria-live="polite">
            {selectedEsi ? (
              <><strong>{pendingEsi !== null ? "Selected" : "Current"}: ESI {selectedEsi}</strong> - {ESI_DESCRIPTIONS[selectedEsi]}</>
            ) : (
              <span className="text-[var(--color-ink-secondary)]">Select an ESI level</span>
            )}
          </span>
          {pendingEsi !== null && (
            <button type="button" onClick={() => setPendingEsi(null)} className="min-h-9 px-2 text-xs font-semibold text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]">
              Cancel
            </button>
          )}
          <button type="button" disabled={pendingEsi === null || savingEsi} onClick={() => void confirmEsi()} className="min-h-9 rounded-md bg-[var(--color-primary)] px-3 text-xs font-semibold text-white disabled:opacity-45">
            {savingEsi ? "Saving..." : "Confirm triage"}
          </button>
        </div>
      </section>

      <section className="triage-section">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-expanded={vitalsOpen} onClick={() => setVitalsOpen((open) => !open)} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold">
            <ChevronDown size={15} className={`transition-transform ${vitalsOpen ? "rotate-180" : ""}`} />
            Record vitals
          </button>
          <span className="mr-auto text-xs text-[var(--color-ink-secondary)]">
            {latest ? `Last recorded ${new Date(latest.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "No vitals recorded"}
          </span>
          {vitalsOpen && (
            <button type="submit" form={triageVitalsFormId} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 text-xs font-semibold text-white">
              <Save size={14} /> Save vitals
            </button>
          )}
        </div>
        {vitalsOpen && (
          <div className="mt-2 border-t border-[var(--color-border)] pt-2">
            <VitalsCaptureForm encounterId={encounterId} source="triage" embedded formId={triageVitalsFormId} showSaveButton={false} />
          </div>
        )}
      </section>

      <section className="triage-section">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Room / bed</h2>
          <span className="text-xs font-bold text-[var(--color-green-text)]">{availableBeds.length} open</span>
          <span className="mr-auto text-xs text-[var(--color-ink-secondary)]" aria-live="polite">
            Current: <strong className="text-[var(--color-ink)]">{currentLocation}{currentZoneName ? ` · ${currentZoneName}` : ""}</strong>
          </span>
          {pendingBed && (
            <>
              <span className="text-xs font-semibold text-[var(--color-primary)]">Selected: {pendingBed.name}</span>
              <button type="button" onClick={() => setPendingBed(null)} className="min-h-9 px-2 text-xs font-semibold text-[var(--color-ink-secondary)]">
                Cancel
              </button>
              <button type="button" disabled={savingBed} onClick={() => void confirmBed()} className="min-h-9 rounded-md bg-[var(--color-primary)] px-3 text-xs font-semibold text-white disabled:opacity-50">
                {savingBed ? "Assigning..." : "Confirm room"}
              </button>
            </>
          )}
        </div>

        {availableBeds.length > 12 && (
          <div className="mt-2 flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-2">
            <label className="flex min-h-9 min-w-[220px] flex-1 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] px-2.5 max-[720px]:min-h-11">
              <Search size={14} className="shrink-0 text-[var(--color-ink-secondary)]" />
              <input
                type="search"
                value={bedSearch}
                onChange={(event) => setBedSearch(event.target.value)}
                placeholder="Search bed or zone"
                aria-label="Search bed or zone"
                className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none focus:shadow-none"
              />
            </label>
            <label className="min-w-[170px] max-[480px]:flex-1">
              <span className="sr-only">Filter beds by zone</span>
              <select value={bedZoneFilter} onChange={(event) => setBedZoneFilter(event.target.value)} className="min-h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] px-2.5 text-sm max-[720px]:min-h-11">
                <option value="all">All zones</option>
                {availableZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
              </select>
            </label>
          </div>
        )}

        {availableBeds.length === 0 ? (
          <div className="mt-2 rounded-md bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-ink-secondary)]">
            No beds available.
          </div>
        ) : filteredBeds.length === 0 ? (
          <div className="mt-2 rounded-md bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-ink-secondary)]">
            No open beds match the current search and zone filter.
          </div>
        ) : (
          <div role="group" aria-label="Available rooms and beds" className="triage-bed-grid mt-2">
            {filteredBeds.map((bed) => {
              const zone = zonesById.get(bed.zone);
              const selected = pendingBed?.id === bed.id;
              return (
                <button
                  key={bed.id}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${bed.name}, ${zone?.name ?? "Unzoned"}${selected ? ", selected" : ", available"}`}
                  onClick={() => setPendingBed(selected ? null : { id: bed.id, name: bed.name, zoneId: bed.zone })}
                  className={`min-h-11 rounded-md border-2 px-2 py-1 text-left text-sm ${
                    selected
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-tint)] text-[var(--color-primary)]"
                      : "border-[var(--color-open-bed-border)] bg-[var(--color-green-tint)] text-[var(--color-green-text)] hover:border-[var(--color-green-solid)] hover:bg-[var(--color-open-bed-hover)]"
                  }`}
                >
                  <span className="flex items-center justify-between gap-1 font-semibold tabular-nums">
                    <span className="truncate">{bed.name}</span>
                    {selected && <CheckCircle2 size={14} className="shrink-0" />}
                  </span>
                  <span className="block truncate text-xs">{zone?.name ?? "Unzoned"}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="triage-section">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Encounter pathway</h2>
          <span className="text-xs text-[var(--color-ink-secondary)]" aria-live="polite">
            Current: <strong className="capitalize text-[var(--color-ink)]">{currentPathway.replace(/_/g, " ")}</strong>
          </span>
        </div>
        <div role="radiogroup" aria-label="Encounter pathway" className="mt-2 grid grid-cols-3 gap-1.5 max-[560px]:grid-cols-1">
          {pathways.map((pathway, index) => {
            const selected = currentPathway === pathway.value;
            const hasKnownPathway = pathways.some((option) => option.value === currentPathway);
            const selectedClass = pathway.value === "fast_track"
              ? "border-[var(--color-green-solid)] bg-[var(--color-green-tint)] text-[var(--color-green-text)]"
              : pathway.value === "critical"
                ? "border-[var(--color-red-solid)] bg-[var(--color-red-tint)] text-[var(--color-red-text)]"
                : "border-[var(--color-primary)] bg-[var(--color-primary-tint)] text-[var(--color-primary)]";
            return (
              <button
                key={pathway.value}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected || (!hasKnownPathway && index === 0) ? 0 : -1}
                onClick={() => void setEncounterPathway(encounterId, pathway.value, mode, pathway.reason, "Triage nurse")}
                onKeyDown={(event) => {
                  const previous = event.key === "ArrowLeft" || event.key === "ArrowUp";
                  const next = event.key === "ArrowRight" || event.key === "ArrowDown";
                  if (!previous && !next && event.key !== "Home" && event.key !== "End") return;
                  event.preventDefault();
                  const nextIndex = event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? pathways.length - 1
                      : (index + (previous ? -1 : 1) + pathways.length) % pathways.length;
                  const nextPathway = pathways[nextIndex];
                  void setEncounterPathway(encounterId, nextPathway.value, mode, nextPathway.reason, "Triage nurse");
                  const choices = event.currentTarget.parentElement?.children;
                  window.setTimeout(() => (choices?.[nextIndex] as HTMLElement | undefined)?.focus(), 0);
                }}
                className={`flex min-h-14 items-center gap-2 rounded-md border-2 px-2.5 py-1.5 text-left text-sm ${selected ? selectedClass : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-muted)]"}`}
              >
                {selected && <CheckCircle2 size={16} className="shrink-0" />}
                <span className="min-w-0 flex-1">
                  <strong className="block">{pathway.label}</strong>
                  <span className={`block truncate text-xs ${selected ? "opacity-80" : "text-[var(--color-ink-secondary)]"}`}>{pathway.description}</span>
                </span>
                {selected && <span className="text-xs font-semibold">Selected</span>}
              </button>
            );
          })}
        </div>
      </section>

      <TriageHistory encounterId={encounterId} />
    </div>
  );
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
  const transitions = useStateTransitions(encounterId);
  const combined = [...patientAudits, ...encounterAudits].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="grid grid-cols-[1fr_0.85fr] gap-3 max-[980px]:grid-cols-1">
    <div className="card">
      <h2 className="mb-3 text-sm font-medium">Audit history</h2>
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
    <div className="card">
      <h2 className="mb-3 text-sm font-medium">State transitions</h2>
      {transitions.length === 0 ? (
        <div className="text-sm text-[var(--color-ink-secondary)]">No transitions recorded yet.</div>
      ) : (
        <div className="space-y-2">
          {transitions.map((transition) => (
            <div key={transition.id} className="border-b border-[var(--color-border)] pb-2 text-sm last:border-0 last:pb-0">
              <div className="font-semibold">
                {transition.previousState ?? "created"} → {transition.newState}
              </div>
              <div className="text-xs text-[var(--color-ink-secondary)]">
                {transition.reason ?? "No reason"} · {transition.actor ?? "Unknown actor"} · {new Date(transition.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}

function MergeModal({ survivor, onClose }: { survivor: Patient; onClose: () => void }) {
  const patients = useAllPatients();
  const mode = useAppStore((s) => s.mode);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<Patient | null>(null);
  const [choices, setChoices] = useState<Record<string, "survivor" | "source">>({});
  const matches = fuzzyPatientMatches(patients.filter((patient) => patient.id !== survivor.id), { text: query, phone: query, nationalId: query });
  const fields: (keyof Patient)[] = ["name", "dateOfBirth", "sex", "phone", "nationalId", "address", "preferredLanguage"];

  async function confirm() {
    if (!source) return;
    const selected: Partial<Patient> = {};
    for (const field of fields) {
      if (choices[String(field)] === "source") {
        (selected as Record<string, unknown>)[field] = source[field];
      }
    }
    await mergePatientRecords(survivor.id, source.id, selected, mode);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="w-full max-w-[760px] rounded-lg bg-[var(--color-surface)] p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--color-primary)]">Merge records</p>
            <h2 className="text-base font-semibold">Survivor: {survivor.name ?? survivor.mrn}</h2>
          </div>
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-sm">Close</button>
        </div>
        {!source ? (
          <div className="space-y-2">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search duplicate record" className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none" />
            {matches.map((match) => (
              <button key={match.patient.id} onClick={() => setSource(match.patient)} className="flex w-full items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-2 text-left text-sm hover:bg-[var(--color-primary-tint)]">
                <span><strong>{match.patient.name ?? "Unknown"}</strong> | {match.patient.mrn ?? match.patient.displayNumber}</span>
                <span className="text-xs text-[var(--color-ink-secondary)]">{match.reasons.join(", ")}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="px-2 py-1 text-left">Field</th>
                    <th className="px-2 py-1 text-left">Keep survivor</th>
                    <th className="px-2 py-1 text-left">Use source</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field) => (
                    <tr key={String(field)} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-2 py-1 font-semibold">{String(field)}</td>
                      <td className="px-2 py-1"><label><input type="radio" checked={choices[String(field)] !== "source"} onChange={() => setChoices((current) => ({ ...current, [String(field)]: "survivor" }))} /> {String(survivor[field] ?? "-")}</label></td>
                      <td className="px-2 py-1"><label><input type="radio" checked={choices[String(field)] === "source"} onChange={() => setChoices((current) => ({ ...current, [String(field)]: "source" }))} /> {String(source[field] ?? "-")}</label></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setSource(null)} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">Back</button>
              <button onClick={() => void confirm()} className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-white">Confirm merge</button>
            </div>
          </div>
        )}
      </div>
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
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-3" onClick={onClose}>
      <div className="w-full max-w-[420px] rounded-xl bg-[var(--color-surface)] p-5" onClick={(e) => e.stopPropagation()}>
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
