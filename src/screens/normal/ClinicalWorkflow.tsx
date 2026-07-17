import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPlus,
  FlaskConical,
  Plus,
  Stethoscope,
} from "lucide-react";
import { useClinicalEvents, useEncounterView, useTriageAssessments } from "../../db/hooks";
import {
  acknowledgeCriticalResult,
  administerMedication,
  placeOrder,
  recordAssessment,
  recordReassessment,
  recordResult,
  recordTreatment,
  setDispositionDecision,
  updateDispositionProgress,
  updateOrderStatus,
} from "../../db/repo";
import { TriageBadge } from "../../components/TriageBadge";
import { DropdownSelect } from "../../components/FloatingDropdown";
import {
  ASSESSMENT_EXAM_OPTIONS,
  ASSESSMENT_HISTORY_OPTIONS,
  ASSESSMENT_IMPRESSION_OPTIONS,
  ASSESSMENT_PLAN_OPTIONS,
  ASSESSMENT_SYMPTOM_OPTIONS,
  orderOptionsFor,
  TREATMENT_OPTIONS,
} from "../../lib/clinicalCatalog";
import { dispositionWorkflowSteps, workflowStatusForEncounter } from "../../domain/encounterStateMachine";
import { useAppStore } from "../../store/useAppStore";
import type {
  ClinicalEvent,
  Disposition,
  OrderStatus,
  OrderType,
} from "../../types";

const inputClass =
  "min-h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]";
const labelClass = "mb-1 block text-xs font-semibold text-[var(--color-ink-secondary)]";

function actorDefault(provider: string | null | undefined) {
  return provider || "Current clinician";
}

function eventContent<T>(event: ClinicalEvent): T {
  return (event.content ?? {}) as T;
}

function EventTime({ value }: { value: number }) {
  return (
    <time className="shrink-0 text-xs text-[var(--color-ink-secondary)]">
      {new Date(value).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}
    </time>
  );
}

export function AssessmentWorkflow({ encounterId }: { encounterId: string }) {
  const view = useEncounterView(encounterId);
  const events = useClinicalEvents(encounterId);
  const mode = useAppStore((state) => state.mode);
  const pushToast = useAppStore((state) => state.pushToast);
  const [form, setForm] = useState({
    symptoms: "",
    medicalHistory: "",
    examination: "",
    impression: "",
    plan: "",
    actor: actorDefault(view?.encounter.currentProvider),
  });
  const assessments = events.filter((event) => event.type === "assessment");

  async function save() {
    if (!form.impression.trim() && !form.plan.trim()) return;
    await recordAssessment(encounterId, form, mode);
    setForm((current) => ({ ...current, symptoms: "", medicalHistory: "", examination: "", impression: "", plan: "" }));
    pushToast("Assessment saved to the clinical timeline");
  }

  return (
    <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] gap-3 max-[980px]:grid-cols-1">
      <section className="card">
        <div className="mb-3 flex items-center gap-2">
          <Stethoscope size={17} className="text-[var(--color-primary)]" />
          <div>
            <h2 className="text-sm font-semibold">Doctor assessment</h2>
            <p className="text-xs text-[var(--color-ink-secondary)]">Clinical thinking and plan, separate from orders.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 max-[560px]:grid-cols-1">
          <AssessmentPickField
            label="Symptoms"
            value={form.symptoms}
            options={ASSESSMENT_SYMPTOM_OPTIONS}
            placeholder="Add symptom template"
            onChange={(symptoms) => setForm({ ...form, symptoms })}
          />
          <AssessmentPickField
            label="Relevant history"
            value={form.medicalHistory}
            options={ASSESSMENT_HISTORY_OPTIONS}
            placeholder="Add history item"
            onChange={(medicalHistory) => setForm({ ...form, medicalHistory })}
          />
          <AssessmentPickField
            label="Physical examination"
            value={form.examination}
            options={ASSESSMENT_EXAM_OPTIONS}
            placeholder="Add exam finding"
            onChange={(examination) => setForm({ ...form, examination })}
          />
          <AssessmentPickField
            label="Impression / possible diagnoses"
            value={form.impression}
            options={ASSESSMENT_IMPRESSION_OPTIONS}
            placeholder="Add impression"
            required
            onChange={(impression) => setForm({ ...form, impression })}
          />
          <Field label="Clinical plan" className="col-span-2 max-[560px]:col-span-1">
            <div className="mb-1">
              <DropdownSelect
                value=""
                options={ASSESSMENT_PLAN_OPTIONS}
                placeholder="Add plan action"
                onChange={(value) => value && setForm({ ...form, plan: appendAssessmentPhrase(form.plan, value) })}
                className={inputClass}
                ariaLabel="Add clinical plan action"
              />
            </div>
            <textarea className={inputClass} rows={2} value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value })} />
          </Field>
          <Field label="Recorded by">
            <input className={inputClass} value={form.actor} onChange={(event) => setForm({ ...form, actor: event.target.value })} />
          </Field>
          <div className="flex items-end justify-end">
            <button onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-white">
              <ClipboardPlus size={15} /> Save assessment
            </button>
          </div>
        </div>
      </section>

      <TimelinePanel title="Assessment history" empty="No assessment recorded yet.">
        {assessments.map((event) => {
          const content = eventContent<typeof form>(event);
          return (
            <article key={event.id} className="border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
              <div className="mb-1 flex items-start justify-between gap-2">
                <strong className="text-sm">{content.impression || "Clinical assessment"}</strong>
                <EventTime value={event.recordedAt} />
              </div>
              {content.plan && <p className="text-sm">Plan: {content.plan}</p>}
              <p className="mt-1 text-xs text-[var(--color-ink-secondary)]">{content.actor}</p>
            </article>
          );
        })}
      </TimelinePanel>
    </div>
  );
}

function AssessmentPickField({
  label,
  value,
  options,
  placeholder,
  required = false,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} required={required}>
      <div className="mb-1">
        <DropdownSelect
          value=""
          options={options}
          placeholder={placeholder}
          onChange={(option) => option && onChange(appendAssessmentPhrase(value, option))}
          className={inputClass}
          ariaLabel={placeholder}
        />
      </div>
      <textarea className={inputClass} rows={2} value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function appendAssessmentPhrase(current: string, phrase: string) {
  const trimmed = current.trim();
  if (!trimmed) return phrase;
  if (trimmed.toLowerCase().includes(phrase.toLowerCase())) return current;
  return `${trimmed}\n${phrase}`;
}

const ORDER_TYPES: OrderType[] = ["laboratory", "imaging", "medication", "procedure", "consultation", "blood_product", "observation", "admission", "transfer", "monitoring", "other"];
const ORDER_STATUSES: OrderStatus[] = [
  "draft",
  "ordered",
  "acknowledged",
  "in_progress",
  "completed",
  "result_available",
  "reviewed",
  "cancelled",
  "rejected",
  "failed",
  "patient_refused",
];

type OrderContent = {
  orderType: OrderType;
  name: string;
  details: string;
  priority: "routine" | "urgent" | "stat";
  actor: string;
  status: OrderStatus;
};

export function OrdersWorkflow({ encounterId }: { encounterId: string }) {
  const view = useEncounterView(encounterId);
  const events = useClinicalEvents(encounterId);
  const mode = useAppStore((state) => state.mode);
  const pushToast = useAppStore((state) => state.pushToast);
  const [form, setForm] = useState<OrderContent>({
    orderType: "laboratory",
    name: "",
    details: "",
    priority: "routine",
    actor: actorDefault(view?.encounter.currentProvider),
    status: "ordered",
  });
  const [resultOrderId, setResultOrderId] = useState<string | null>(null);
  const [resultText, setResultText] = useState("");
  const [critical, setCritical] = useState(false);
  const [resultActor, setResultActor] = useState(actorDefault(view?.encounter.currentProvider));
  const orders = events.filter((event) => event.type === "order");

  function currentStatus(orderId: string): OrderStatus {
    const statusEvent = events.find(
      (event) => event.type === "order_status" && eventContent<{ orderId?: string }>(event).orderId === orderId,
    );
    return statusEvent ? eventContent<{ status: OrderStatus }>(statusEvent).status : "ordered";
  }

  async function addOrder() {
    if (!form.name.trim()) return;
    await placeOrder(encounterId, form, mode);
    setForm((current) => ({ ...current, name: "", details: "" }));
    pushToast("Order placed");
  }

  async function saveResult(orderId: string) {
    if (!resultText.trim()) return;
    await recordResult(encounterId, orderId, resultText.trim(), resultActor, critical, mode);
    await updateOrderStatus(encounterId, orderId, "completed", resultActor, "Result available", mode);
    setResultOrderId(null);
    setResultText("");
    setCritical(false);
    pushToast(critical ? "Critical result recorded - acknowledgement required" : "Result recorded");
  }

  return (
    <div className="space-y-3">
      <section className="card">
        <div className="mb-2 flex items-center gap-2">
          <FlaskConical size={17} className="text-[var(--color-primary)]" />
          <h2 className="text-sm font-semibold">Place an order</h2>
        </div>
        <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(140px,1.2fr)_minmax(140px,1.4fr)_minmax(90px,0.6fr)_minmax(110px,0.8fr)_auto] items-end gap-2 max-[860px]:grid-cols-2">
          <Field label="Type"><select className={inputClass} value={form.orderType} onChange={(event) => setForm({ ...form, orderType: event.target.value as OrderType })}>{ORDER_TYPES.map((type) => <option key={type}>{type}</option>)}</select></Field>
          <Field label="Order" required><input className={inputClass} list="order-name-options" placeholder="CBC, CT head, oxygen..." value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><datalist id="order-name-options">{orderOptionsFor(form.orderType).map((option) => <option key={option} value={option} />)}</datalist></Field>
          <Field label="Details"><input className={inputClass} placeholder="Dose, site, clinical question" value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} /></Field>
          <Field label="Priority"><select className={inputClass} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as OrderContent["priority"] })}><option>routine</option><option>urgent</option><option>stat</option></select></Field>
          <Field label="Ordered by"><input className={inputClass} value={form.actor} onChange={(event) => setForm({ ...form, actor: event.target.value })} /></Field>
          <button onClick={() => void addOrder()} className="inline-flex h-[34px] items-center justify-center gap-1 rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white"><Plus size={15} /> Add</button>
        </div>
      </section>

      {orders.length === 0 ? (
        <div className="card text-sm text-[var(--color-ink-secondary)]">No orders placed yet.</div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => {
            const content = eventContent<OrderContent>(order);
            const status = currentStatus(order.id);
            const results = events.filter((event) => event.type === "result" && eventContent<{ orderId?: string }>(event).orderId === order.id);
            return (
              <article key={order.id} className="card">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[var(--color-primary-tint)] px-2 py-1 text-xs font-bold uppercase text-[var(--color-primary)]">{content.orderType}</span>
                  <strong className="mr-auto text-sm">{content.name}</strong>
                  <span className={`rounded px-2 py-1 text-xs font-bold uppercase ${content.priority === "stat" ? "bg-[var(--color-red-tint)] text-[var(--color-red-text)]" : "bg-[var(--color-surface-muted)] text-[var(--color-ink-secondary)]"}`}>{content.priority}</span>
                  <select
                    aria-label={`Status for ${content.name}`}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs capitalize"
                    value={status}
                    onChange={(event) => void updateOrderStatus(encounterId, order.id, event.target.value as OrderStatus, actorDefault(view?.encounter.currentProvider), "", mode)}
                  >
                    {ORDER_STATUSES.map((value) => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}
                  </select>
                  <button onClick={() => setResultOrderId(resultOrderId === order.id ? null : order.id)} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs">Add result</button>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-ink-secondary)]">
                  <span>{content.details || "No additional details"}</span><span>{content.actor}</span><EventTime value={order.recordedAt} />
                </div>
                {resultOrderId === order.id && (
                  <div className="mt-2 grid grid-cols-[minmax(200px,1fr)_minmax(140px,170px)_auto_auto] items-end gap-2 border-t border-[var(--color-border)] pt-2 max-[720px]:grid-cols-1">
                    <Field label="Verified result" required><input className={inputClass} value={resultText} onChange={(event) => setResultText(event.target.value)} /></Field>
                    <Field label="Verified by"><input className={inputClass} value={resultActor} onChange={(event) => setResultActor(event.target.value)} /></Field>
                    <label className="flex h-[34px] items-center gap-2 text-xs font-semibold text-[var(--color-red-text)]"><input type="checkbox" checked={critical} onChange={(event) => setCritical(event.target.checked)} /> Critical result</label>
                    <button onClick={() => void saveResult(order.id)} className="h-[34px] rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white">Save result</button>
                  </div>
                )}
                {content.orderType === "medication" && (
                  <MedicationAdministrationRow
                    encounterId={encounterId}
                    orderId={order.id}
                    medication={content.name}
                    actor={actorDefault(view?.encounter.currentProvider)}
                  />
                )}
                {results.map((resultEvent) => <ResultRow key={resultEvent.id} event={resultEvent} encounterId={encounterId} events={events} />)}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ResultRow({ event, encounterId, events }: { event: ClinicalEvent; encounterId: string; events: ClinicalEvent[] }) {
  const mode = useAppStore((state) => state.mode);
  const content = eventContent<{ result: string; actor: string; critical: boolean }>(event);
  const acknowledged = events.some((candidate) => {
    const value = eventContent<{ resultId?: string; status?: string }>(candidate);
    return candidate.type === "critical_alert" && value.resultId === event.id && value.status === "acknowledged";
  });
  const [action, setAction] = useState("");

  return (
    <div className={`mt-2 border-l-4 px-2 py-1.5 ${content.critical ? "border-[var(--color-red-solid)] bg-[var(--color-red-tint)]" : "border-[var(--color-green-solid)] bg-[var(--color-green-tint)]"}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {content.critical ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
        <strong>{content.result}</strong>
        <span className="ml-auto text-xs">{content.actor}</span>
        <EventTime value={event.recordedAt} />
      </div>
      {content.critical && !acknowledged && (
        <div className="mt-1 flex gap-2">
          <input className={inputClass} placeholder="Action taken after notification" value={action} onChange={(input) => setAction(input.target.value)} />
          <button disabled={!action.trim()} onClick={() => void acknowledgeCriticalResult(encounterId, event.id, "Current clinician", action, mode)} className="shrink-0 rounded-md bg-[var(--color-red-solid)] px-2.5 text-xs font-semibold text-white disabled:opacity-50">Acknowledge</button>
        </div>
      )}
      {content.critical && acknowledged && <div className="mt-1 text-xs font-semibold">Acknowledged and action documented</div>}
    </div>
  );
}

function MedicationAdministrationRow({
  encounterId,
  orderId,
  medication,
  actor,
}: {
  encounterId: string;
  orderId: string;
  medication: string;
  actor: string;
}) {
  const mode = useAppStore((state) => state.mode);
  const pushToast = useAppStore((state) => state.pushToast);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    prescribedDose: "",
    administeredDose: "",
    route: "PO",
    response: "",
    notAdministeredReason: "",
    actor,
  });

  async function save() {
    if (!form.administeredDose.trim() && !form.notAdministeredReason.trim()) return;
    await administerMedication(
      encounterId,
      {
        medicationOrderId: orderId,
        medication,
        prescribedDose: form.prescribedDose,
        administeredDose: form.administeredDose,
        route: form.route,
        response: form.response,
        notAdministeredReason: form.notAdministeredReason || null,
        actor: form.actor || "Current nurse",
      },
      mode,
    );
    setOpen(false);
    pushToast(form.notAdministeredReason ? "Medication non-administration documented" : "Medication administration recorded");
  }

  return (
    <div className="mt-2 border-t border-[var(--color-border)] pt-2">
      {!open ? (
        <button onClick={() => setOpen(true)} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold">
          Record administration
        </button>
      ) : (
        <div className="grid grid-cols-[repeat(2,minmax(90px,1fr))_minmax(70px,0.7fr)_minmax(110px,1.2fr)_minmax(110px,1.2fr)_minmax(100px,1fr)_auto] items-end gap-2 max-[980px]:grid-cols-2">
          <Field label="Ordered dose"><input className={inputClass} value={form.prescribedDose} onChange={(event) => setForm({ ...form, prescribedDose: event.target.value })} placeholder="500 mg" /></Field>
          <Field label="Given dose"><input className={inputClass} value={form.administeredDose} onChange={(event) => setForm({ ...form, administeredDose: event.target.value })} placeholder="500 mg" /></Field>
          <Field label="Route"><input className={inputClass} value={form.route} onChange={(event) => setForm({ ...form, route: event.target.value })} /></Field>
          <Field label="Response"><input className={inputClass} value={form.response} onChange={(event) => setForm({ ...form, response: event.target.value })} /></Field>
          <Field label="Not given reason"><input className={inputClass} value={form.notAdministeredReason} onChange={(event) => setForm({ ...form, notAdministeredReason: event.target.value })} placeholder="Refused, held..." /></Field>
          <Field label="By"><input className={inputClass} value={form.actor} onChange={(event) => setForm({ ...form, actor: event.target.value })} /></Field>
          <button onClick={() => void save()} className="h-[34px] rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white">Save</button>
        </div>
      )}
    </div>
  );
}

export function CareWorkflow({ encounterId }: { encounterId: string }) {
  const view = useEncounterView(encounterId);
  const events = useClinicalEvents(encounterId);
  const mode = useAppStore((state) => state.mode);
  const pushToast = useAppStore((state) => state.pushToast);
  const defaultActor = actorDefault(view?.encounter.currentProvider);
  const [treatment, setTreatment] = useState({ name: "", details: "", actor: defaultActor });
  const [reassessment, setReassessment] = useState<{ response: "improved" | "unchanged" | "worse"; painScore: string; notes: string; actor: string }>({ response: "unchanged", painScore: "", notes: "", actor: defaultActor });
  const careEvents = events.filter((event) => event.type === "treatment" || event.type === "reassessment" || event.type === "medication");

  async function saveTreatment() {
    if (!treatment.name.trim()) return;
    await recordTreatment(encounterId, { ...treatment, orderId: null }, mode);
    setTreatment((current) => ({ ...current, name: "", details: "" }));
    pushToast("Treatment administration recorded");
  }

  async function saveReassessment() {
    if (!reassessment.notes.trim()) return;
    await recordReassessment(encounterId, { ...reassessment, painScore: reassessment.painScore ? Number(reassessment.painScore) : null }, mode);
    setReassessment((current) => ({ ...current, painScore: "", notes: "" }));
    pushToast("Reassessment added without replacing prior findings");
  }

  return (
    <div className="grid grid-cols-2 gap-3 max-[980px]:grid-cols-1">
      <section className="card">
        <h2 className="mb-2 text-sm font-semibold">Treatment actually given</h2>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Action / medication" required><input className={inputClass} list="treatment-name-options" placeholder="Oxygen started, morphine given..." value={treatment.name} onChange={(event) => setTreatment({ ...treatment, name: event.target.value })} /><datalist id="treatment-name-options">{TREATMENT_OPTIONS.map((option) => <option key={option} value={option} />)}</datalist></Field>
          <Field label="Dose / details"><input className={inputClass} placeholder="10 L/min, 2 mg IV..." value={treatment.details} onChange={(event) => setTreatment({ ...treatment, details: event.target.value })} /></Field>
          <Field label="Performed by"><input className={inputClass} value={treatment.actor} onChange={(event) => setTreatment({ ...treatment, actor: event.target.value })} /></Field>
          <div className="flex items-end justify-end"><button onClick={() => void saveTreatment()} className="h-[34px] rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white">Record treatment</button></div>
        </div>
      </section>
      <section className="card">
        <h2 className="mb-2 text-sm font-semibold">Reassessment</h2>
        <div className="grid grid-cols-[minmax(110px,130px)_minmax(80px,90px)_1fr] gap-2 max-[560px]:grid-cols-1">
          <Field label="Response"><select className={inputClass} value={reassessment.response} onChange={(event) => setReassessment({ ...reassessment, response: event.target.value as typeof reassessment.response })}><option>improved</option><option>unchanged</option><option>worse</option></select></Field>
          <Field label="Pain 0-10"><input type="number" min="0" max="10" className={inputClass} value={reassessment.painScore} onChange={(event) => setReassessment({ ...reassessment, painScore: event.target.value })} /></Field>
          <Field label="Findings" required><input className={inputClass} placeholder="Response, new findings, next step" value={reassessment.notes} onChange={(event) => setReassessment({ ...reassessment, notes: event.target.value })} /></Field>
          <Field label="Recorded by"><input className={inputClass} value={reassessment.actor} onChange={(event) => setReassessment({ ...reassessment, actor: event.target.value })} /></Field>
          <div className="col-span-2 flex items-end justify-end max-[560px]:col-span-1"><button onClick={() => void saveReassessment()} className="h-[34px] rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white">Add reassessment</button></div>
        </div>
      </section>
      <div className="col-span-2 max-[980px]:col-span-1">
        <TimelinePanel title="Care timeline" empty="No treatment or reassessment recorded yet.">
          {careEvents.map((event) => {
            const content = eventContent<{ name?: string; medication?: string; administeredDose?: string; notAdministeredReason?: string | null; details?: string; response?: string; painScore?: number | null; notes?: string; actor?: string }>(event);
            return <article key={event.id} className="grid grid-cols-[110px_1fr_auto] gap-2 border-b border-[var(--color-border)] pb-2 text-sm last:border-0 last:pb-0"><strong className="capitalize text-[var(--color-primary)]">{event.type}</strong><div><div className="font-semibold capitalize">{content.name ?? content.medication ?? content.response}</div><div className="text-xs text-[var(--color-ink-secondary)]">{content.notAdministeredReason ? `Not given: ${content.notAdministeredReason}` : content.administeredDose ? `Given ${content.administeredDose}` : content.details ?? content.notes}{content.painScore !== null && content.painScore !== undefined ? ` | Pain ${content.painScore}/10` : ""} | {content.actor}</div></div><EventTime value={event.recordedAt} /></article>;
          })}
        </TimelinePanel>
      </div>
    </div>
  );
}

const DISPOSITIONS: { value: Disposition; label: string }[] = [
  { value: "discharged", label: "Discharge home" },
  { value: "ward", label: "Admit to ward" },
  { value: "icu", label: "Admit to ICU" },
  { value: "operating_room", label: "Operating room" },
  { value: "observation", label: "Observation" },
  { value: "transferred", label: "Transfer" },
  { value: "deceased", label: "Deceased" },
  { value: "left_without_being_seen", label: "Left without being seen" },
  { value: "left_against_medical_advice", label: "Left against medical advice" },
  { value: "absconded", label: "Absconded" },
  { value: "unknown_status", label: "Unknown status" },
];

export function DispositionWorkflow({ encounterId }: { encounterId: string }) {
  const view = useEncounterView(encounterId);
  const events = useClinicalEvents(encounterId);
  const mode = useAppStore((state) => state.mode);
  const pushToast = useAppStore((state) => state.pushToast);
  const [selection, setSelection] = useState<Disposition>(view?.encounter.disposition ?? "discharged");
  const [details, setDetails] = useState("");
  const [actor, setActor] = useState(actorDefault(view?.encounter.currentProvider));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoff, setHandoff] = useState({
    situation: "",
    background: "",
    assessment: "",
    recommendation: "",
    receivingUnit: "",
    receivingClinician: "",
  });
  const timeline = events.filter((event) => event.type === "disposition" || event.type === "disposition_status");
  const latestDecisionAt = timeline
    .filter((event) => event.type === "disposition")
    .reduce((latest, event) => Math.max(latest, event.recordedAt), 0);
  const activeDisposition = view?.encounter.disposition ?? null;
  const steps = activeDisposition ? dispositionWorkflowSteps(activeDisposition) : [];
  const completedValues = new Set(
    timeline
      .filter((event) => event.type === "disposition_status" && event.recordedAt >= latestDecisionAt)
      .map((event) => eventContent<{ status?: string }>(event).status)
      .filter((status): status is string => Boolean(status)),
  );
  const nextStepIndex = steps.findIndex((step) => !completedValues.has(step.value));
  const nextStep = nextStepIndex >= 0 ? steps[nextStepIndex] : null;
  const encounterClosed = Boolean(view?.encounter.closedAt);
  const workflowStatus = view ? workflowStatusForEncounter(view.encounter) : null;

  useEffect(() => {
    if (view?.encounter.disposition) setSelection(view.encounter.disposition);
  }, [view?.encounter.disposition]);

  async function decide() {
    setBusy(true);
    setError(null);
    try {
      await setDispositionDecision(encounterId, selection, actor, details, mode);
      pushToast("Disposition decision recorded; encounter remains open until departure");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Disposition decision could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  async function advance() {
    if (!nextStep) return;
    setBusy(true);
    setError(null);
    try {
      await updateDispositionProgress(
        encounterId,
        nextStep.value,
        actor,
        details,
        Boolean(nextStep.closesEncounter),
        mode,
        nextStep.requiresHandoff ? { handoff } : undefined,
      );
      pushToast(nextStep.closesEncounter ? "Encounter closed after departure" : `${nextStep.label} recorded`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Disposition step could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <section className="card">
        <div className="grid grid-cols-[minmax(200px,1fr)_minmax(200px,1fr)_minmax(130px,180px)_auto] items-end gap-2 max-[980px]:grid-cols-2">
          <Field label="Disposition decision" required><select className={inputClass} value={selection} onChange={(event) => setSelection(event.target.value as Disposition)}>{DISPOSITIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
          <Field label="Destination / instructions / reason"><input className={inputClass} value={details} onChange={(event) => setDetails(event.target.value)} /></Field>
          <Field label="Decided by"><input className={inputClass} value={actor} onChange={(event) => setActor(event.target.value)} /></Field>
          <button disabled={busy || !actor.trim()} onClick={() => void decide()} className="h-[34px] rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Record decision"}</button>
        </div>
        {error && <p role="alert" className="mt-2 text-xs font-semibold text-[var(--color-red-text)]">{error}</p>}
      </section>
      {activeDisposition && (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-sm font-semibold">
              {DISPOSITIONS.find((d) => d.value === activeDisposition)?.label ?? activeDisposition.replace(/_/g, " ")}
            </h2>
            {encounterClosed ? (
              <span className="rounded bg-[var(--color-green-tint)] px-2 py-1 text-xs font-semibold text-[var(--color-green-text)]">Complete — patient departed</span>
            ) : (
              <span className="rounded bg-[var(--color-yellow-tint)] px-2 py-1 text-xs font-semibold text-[var(--color-yellow-text)]">
                {workflowStatus?.replace(/_/g, " ")} | Next: {nextStep?.label.toLowerCase() ?? "complete"} | {view?.encounter.currentLocationName ?? "location unassigned"}
              </span>
            )}
          </div>

          {/* Compact progress flow: Decision -> each operational step -> close.
              Purely a read-only visualization over existing dispositionStatus
              events; step definitions and the update action are unchanged. */}
          <ol className="flex flex-wrap items-center gap-1.5" aria-label="Disposition progress">
            <FlowNode label="Decision" state="done" />
            {steps.map((step, index) => {
              const done = completedValues.has(step.value);
              const isNext = index === nextStepIndex;
              return (
                <FlowNode key={step.value} label={step.label} state={done ? "done" : isNext ? "next" : "pending"} />
              );
            })}
          </ol>

          {nextStep?.requiresHandoff && (
            <div className="grid grid-cols-2 gap-2 border-t border-[var(--color-border)] pt-2 max-[720px]:grid-cols-1">
              <Field label="Situation" required><input className={inputClass} value={handoff.situation} onChange={(event) => setHandoff({ ...handoff, situation: event.target.value })} placeholder="Current problem and disposition" /></Field>
              <Field label="Background" required><input className={inputClass} value={handoff.background} onChange={(event) => setHandoff({ ...handoff, background: event.target.value })} placeholder="Relevant history and allergies" /></Field>
              <Field label="Assessment" required><input className={inputClass} value={handoff.assessment} onChange={(event) => setHandoff({ ...handoff, assessment: event.target.value })} placeholder="Findings, vitals, results" /></Field>
              <Field label="Recommendation" required><input className={inputClass} value={handoff.recommendation} onChange={(event) => setHandoff({ ...handoff, recommendation: event.target.value })} placeholder="Monitoring and next actions" /></Field>
              <Field label="Receiving unit" required><input className={inputClass} value={handoff.receivingUnit} onChange={(event) => setHandoff({ ...handoff, receivingUnit: event.target.value })} placeholder="ICU, ward, facility" /></Field>
              <Field label="Receiving clinician" required><input className={inputClass} value={handoff.receivingClinician} onChange={(event) => setHandoff({ ...handoff, receivingClinician: event.target.value })} placeholder="Name / role" /></Field>
            </div>
          )}

          {!encounterClosed && nextStep && (
            <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-2">
              <p className="text-xs text-[var(--color-ink-secondary)]">Only the next valid workflow action is available.</p>
              <button type="button" disabled={busy} onClick={() => void advance()} className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? "Saving..." : nextStep.label}
              </button>
            </div>
          )}
          {error && <p role="alert" className="text-xs font-semibold text-[var(--color-red-text)]">{error}</p>}
        </section>
      )}
      <TimelinePanel title="Disposition timeline" empty="No disposition decision recorded yet.">
        {timeline.map((event) => {
          const content = eventContent<{ disposition?: string; status?: string; actor?: string; details?: string }>(event);
          return <article key={event.id} className="flex items-start gap-3 border-b border-[var(--color-border)] pb-2 text-sm last:border-0 last:pb-0"><strong className="min-w-[160px] capitalize">{(content.disposition ?? content.status ?? event.type).replace(/_/g, " ")}</strong><span className="flex-1 text-[var(--color-ink-secondary)]">{content.details || content.actor}</span><EventTime value={event.recordedAt} /></article>;
        })}
      </TimelinePanel>
    </div>
  );
}

function FlowNode({ label, state }: { label: string; state: "done" | "next" | "pending" }) {
  return (
    <li
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        state === "done"
          ? "bg-[var(--color-green-tint)] text-[var(--color-green-text)]"
          : state === "next"
            ? "border border-[var(--color-primary)] bg-[var(--color-primary-tint)] text-[var(--color-primary)]"
            : "bg-[var(--color-surface-muted)] text-[var(--color-ink-secondary)]"
      }`}
    >
      {state === "done" ? <CheckCircle2 size={13} /> : null}
      {label}
    </li>
  );
}

export function TriageHistory({ encounterId, compact = false }: { encounterId: string; compact?: boolean }) {
  const assessments = useTriageAssessments(encounterId);
  if (compact) {
    return (
      <section className="triage-history-panel" aria-label="Triage history records">
        {assessments.length === 0 ? (
          <p>No triage assessment has been recorded.</p>
        ) : (
          <ol>
            {assessments.map((assessment, index) => (
              <li key={assessment.id}>
                <time>{new Date(assessment.performedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                <span><TriageBadge level={assessment.level} size="sm" /></span>
                <strong>{index === 0 ? "Current" : "Previous"}</strong>
                <span>{assessment.note || `${assessment.algorithm.toUpperCase()} assessment`}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    );
  }
  return (
    <section className="triage-section">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Triage history</h2>
        <span className="text-xs font-semibold text-[var(--color-ink-secondary)]">{assessments.length} assessment{assessments.length === 1 ? "" : "s"}</span>
      </div>
      {assessments.length === 0 ? (
        <p className="mt-1 text-sm text-[var(--color-ink-secondary)]">No triage assessment has been recorded.</p>
      ) : (
        <ol className="mt-2 border-t border-[var(--color-border)]">
          {assessments.map((assessment, index) => (
            <li key={assessment.id} className="grid grid-cols-[64px_72px_minmax(0,1fr)] items-center gap-2 border-b border-[var(--color-border)] py-1.5 last:border-0 max-[520px]:grid-cols-[58px_72px_minmax(0,1fr)]">
              <time className="text-xs font-semibold tabular-nums text-[var(--color-ink-secondary)]">
                {new Date(assessment.performedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </time>
              <span className="shrink-0"><TriageBadge level={assessment.level} size="sm" /></span>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold">{index === 0 ? "Current" : "Previous"}</span>
                <span className="ml-2 text-xs text-[var(--color-ink-secondary)]">{assessment.note || `${assessment.algorithm.toUpperCase()} assessment`}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Field({ label, required = false, className = "", children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={className}>
      <span className={labelClass}>
        {label}
        {required && <span className="ml-0.5 text-[var(--color-red-solid)]">*</span>}
      </span>
      {children}
    </label>
  );
}

function TimelinePanel({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const items = useMemo(() => Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [], [children]);
  return <section className="card"><h2 className="mb-2 text-sm font-semibold">{title}</h2>{items.length === 0 ? <p className="text-sm text-[var(--color-ink-secondary)]">{empty}</p> : <div className="space-y-2">{children}</div>}</section>;
}
