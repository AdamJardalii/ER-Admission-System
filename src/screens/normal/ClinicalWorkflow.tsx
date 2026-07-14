import { useMemo, useState } from "react";
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
import { useAppStore } from "../../store/useAppStore";
import type {
  ClinicalEvent,
  Disposition,
  OrderStatus,
  OrderType,
} from "../../types";

const inputClass =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]";
const labelClass = "mb-1 block text-xs font-bold uppercase text-[var(--color-ink-secondary)]";

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
    <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] gap-3 max-[920px]:grid-cols-1">
      <section className="card">
        <div className="mb-3 flex items-center gap-2">
          <Stethoscope size={17} className="text-[var(--color-primary)]" />
          <div>
            <h2 className="text-sm font-semibold">Doctor assessment</h2>
            <p className="text-xs text-[var(--color-ink-secondary)]">Clinical thinking and plan, separate from orders.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 max-[620px]:grid-cols-1">
          <Field label="Symptoms">
            <textarea className={inputClass} rows={2} value={form.symptoms} onChange={(event) => setForm({ ...form, symptoms: event.target.value })} />
          </Field>
          <Field label="Relevant history">
            <textarea className={inputClass} rows={2} value={form.medicalHistory} onChange={(event) => setForm({ ...form, medicalHistory: event.target.value })} />
          </Field>
          <Field label="Physical examination">
            <textarea className={inputClass} rows={2} value={form.examination} onChange={(event) => setForm({ ...form, examination: event.target.value })} />
          </Field>
          <Field label="Impression / possible diagnoses">
            <textarea className={inputClass} rows={2} value={form.impression} onChange={(event) => setForm({ ...form, impression: event.target.value })} />
          </Field>
          <Field label="Clinical plan" className="col-span-2 max-[620px]:col-span-1">
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

const ORDER_TYPES: OrderType[] = ["laboratory", "imaging", "medication", "procedure", "consultation"];
const ORDER_STATUSES: OrderStatus[] = [
  "ordered",
  "acknowledged",
  "in_progress",
  "completed",
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
        <div className="grid grid-cols-[150px_minmax(160px,1fr)_minmax(180px,1.3fr)_110px_170px_auto] items-end gap-2 max-[1050px]:grid-cols-2">
          <Field label="Type"><select className={inputClass} value={form.orderType} onChange={(event) => setForm({ ...form, orderType: event.target.value as OrderType })}>{ORDER_TYPES.map((type) => <option key={type}>{type}</option>)}</select></Field>
          <Field label="Order"><input className={inputClass} placeholder="CBC, CT head, oxygen..." value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
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
                  <div className="mt-2 grid grid-cols-[minmax(200px,1fr)_170px_auto_auto] items-end gap-2 border-t border-[var(--color-border)] pt-2 max-[760px]:grid-cols-1">
                    <Field label="Verified result"><input className={inputClass} value={resultText} onChange={(event) => setResultText(event.target.value)} /></Field>
                    <Field label="Verified by"><input className={inputClass} value={resultActor} onChange={(event) => setResultActor(event.target.value)} /></Field>
                    <label className="flex h-[34px] items-center gap-2 text-xs font-semibold text-[var(--color-red-text)]"><input type="checkbox" checked={critical} onChange={(event) => setCritical(event.target.checked)} /> Critical result</label>
                    <button onClick={() => void saveResult(order.id)} className="h-[34px] rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white">Save result</button>
                  </div>
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

export function CareWorkflow({ encounterId }: { encounterId: string }) {
  const view = useEncounterView(encounterId);
  const events = useClinicalEvents(encounterId);
  const mode = useAppStore((state) => state.mode);
  const pushToast = useAppStore((state) => state.pushToast);
  const defaultActor = actorDefault(view?.encounter.currentProvider);
  const [treatment, setTreatment] = useState({ name: "", details: "", actor: defaultActor });
  const [reassessment, setReassessment] = useState<{ response: "improved" | "unchanged" | "worse"; painScore: string; notes: string; actor: string }>({ response: "unchanged", painScore: "", notes: "", actor: defaultActor });
  const careEvents = events.filter((event) => event.type === "treatment" || event.type === "reassessment");

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
    <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
      <section className="card">
        <h2 className="mb-2 text-sm font-semibold">Treatment actually given</h2>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Action / medication"><input className={inputClass} placeholder="Oxygen started, morphine given..." value={treatment.name} onChange={(event) => setTreatment({ ...treatment, name: event.target.value })} /></Field>
          <Field label="Dose / details"><input className={inputClass} placeholder="10 L/min, 2 mg IV..." value={treatment.details} onChange={(event) => setTreatment({ ...treatment, details: event.target.value })} /></Field>
          <Field label="Performed by"><input className={inputClass} value={treatment.actor} onChange={(event) => setTreatment({ ...treatment, actor: event.target.value })} /></Field>
          <div className="flex items-end justify-end"><button onClick={() => void saveTreatment()} className="h-[34px] rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white">Record treatment</button></div>
        </div>
      </section>
      <section className="card">
        <h2 className="mb-2 text-sm font-semibold">Reassessment</h2>
        <div className="grid grid-cols-[130px_90px_1fr] gap-2 max-[620px]:grid-cols-1">
          <Field label="Response"><select className={inputClass} value={reassessment.response} onChange={(event) => setReassessment({ ...reassessment, response: event.target.value as typeof reassessment.response })}><option>improved</option><option>unchanged</option><option>worse</option></select></Field>
          <Field label="Pain 0-10"><input type="number" min="0" max="10" className={inputClass} value={reassessment.painScore} onChange={(event) => setReassessment({ ...reassessment, painScore: event.target.value })} /></Field>
          <Field label="Findings"><input className={inputClass} placeholder="Response, new findings, next step" value={reassessment.notes} onChange={(event) => setReassessment({ ...reassessment, notes: event.target.value })} /></Field>
          <Field label="Recorded by"><input className={inputClass} value={reassessment.actor} onChange={(event) => setReassessment({ ...reassessment, actor: event.target.value })} /></Field>
          <div className="col-span-2 flex items-end justify-end max-[620px]:col-span-1"><button onClick={() => void saveReassessment()} className="h-[34px] rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white">Add reassessment</button></div>
        </div>
      </section>
      <div className="col-span-2 max-[900px]:col-span-1">
        <TimelinePanel title="Care timeline" empty="No treatment or reassessment recorded yet.">
          {careEvents.map((event) => {
            const content = eventContent<{ name?: string; details?: string; response?: string; painScore?: number | null; notes?: string; actor?: string }>(event);
            return <article key={event.id} className="grid grid-cols-[110px_1fr_auto] gap-2 border-b border-[var(--color-border)] pb-2 text-sm last:border-0 last:pb-0"><strong className="capitalize text-[var(--color-primary)]">{event.type}</strong><div><div className="font-semibold capitalize">{content.name ?? content.response}</div><div className="text-xs text-[var(--color-ink-secondary)]">{content.details ?? content.notes}{content.painScore !== null && content.painScore !== undefined ? ` | Pain ${content.painScore}/10` : ""} | {content.actor}</div></div><EventTime value={event.recordedAt} /></article>;
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

function dispositionSteps(disposition: Disposition | null): { label: string; value: string; closes?: boolean }[] {
  if (["ward", "icu", "operating_room", "admitted"].includes(disposition ?? "")) return [
    { label: "Specialty accepted", value: "specialty_accepted" }, { label: "Bed requested", value: "bed_requested" }, { label: "Bed ready", value: "bed_ready" }, { label: "Handoff complete", value: "handoff_complete" }, { label: "Departed ER", value: "departed_er", closes: true },
  ];
  if (disposition === "transferred") return [
    { label: "Transfer accepted", value: "transfer_accepted" }, { label: "Transport requested", value: "transport_requested" }, { label: "Handoff complete", value: "handoff_complete" }, { label: "Patient departed", value: "departed", closes: true }, { label: "Arrival confirmed", value: "arrival_confirmed", closes: true },
  ];
  if (disposition === "discharged") return [
    { label: "Prescription ready", value: "prescription_ready" }, { label: "Instructions explained", value: "instructions_explained" }, { label: "Follow-up arranged", value: "follow_up_arranged" }, { label: "Patient departed", value: "departed", closes: true },
  ];
  if (disposition === "observation") return [
    { label: "Monitoring started", value: "monitoring_started" }, { label: "Repeat tests due", value: "repeat_tests_due" }, { label: "New decision required", value: "new_decision_required" },
  ];
  return [{ label: "Outcome confirmed", value: "confirmed", closes: true }];
}

export function DispositionWorkflow({ encounterId }: { encounterId: string }) {
  const view = useEncounterView(encounterId);
  const events = useClinicalEvents(encounterId);
  const mode = useAppStore((state) => state.mode);
  const pushToast = useAppStore((state) => state.pushToast);
  const [selection, setSelection] = useState<Disposition>(view?.encounter.disposition ?? "discharged");
  const [details, setDetails] = useState("");
  const [actor, setActor] = useState(actorDefault(view?.encounter.currentProvider));
  const timeline = events.filter((event) => event.type === "disposition" || event.type === "disposition_status");
  const activeDisposition = view?.encounter.disposition ?? null;

  async function decide() {
    await setDispositionDecision(encounterId, selection, actor, details, mode);
    pushToast("Disposition decision recorded; encounter remains open until departure");
  }

  return (
    <div className="space-y-3">
      <section className="card">
        <div className="grid grid-cols-[minmax(260px,1fr)_minmax(220px,1fr)_180px_auto] items-end gap-2 max-[900px]:grid-cols-2">
          <Field label="Disposition decision"><select className={inputClass} value={selection} onChange={(event) => setSelection(event.target.value as Disposition)}>{DISPOSITIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
          <Field label="Destination / instructions / reason"><input className={inputClass} value={details} onChange={(event) => setDetails(event.target.value)} /></Field>
          <Field label="Decided by"><input className={inputClass} value={actor} onChange={(event) => setActor(event.target.value)} /></Field>
          <button onClick={() => void decide()} className="h-[34px] rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white">Record decision</button>
        </div>
      </section>
      {activeDisposition && (
        <section className="card">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-sm font-semibold">Operational progress: {activeDisposition.replace(/_/g, " ")}</h2>
            <span className="rounded bg-[var(--color-yellow-tint)] px-2 py-1 text-xs font-semibold text-[var(--color-yellow-text)]">Decision recorded; location remains {view?.encounter.currentLocationName ?? "unassigned"}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {dispositionSteps(activeDisposition).map((step) => <button key={step.value} onClick={() => void updateDispositionProgress(encounterId, step.value, actor, details, Boolean(step.closes), mode)} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-semibold hover:border-[var(--color-primary)]">{step.label}</button>)}
          </div>
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

export function TriageHistory({ encounterId }: { encounterId: string }) {
  const assessments = useTriageAssessments(encounterId);
  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <div><h2 className="text-sm font-semibold">Triage history</h2><p className="text-xs text-[var(--color-ink-secondary)]">Each re-triage creates a new record.</p></div>
        <span className="text-xs font-semibold text-[var(--color-ink-secondary)]">{assessments.length} assessment{assessments.length === 1 ? "" : "s"}</span>
      </div>
      <div className="space-y-2">
        {assessments.map((assessment, index) => <div key={assessment.id} className="grid grid-cols-[90px_1fr_auto] items-center gap-3 border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0"><TriageBadge level={assessment.level} size="sm" /><div><div className="text-sm font-semibold">{index === 0 ? "Current priority" : "Previous priority"}</div><div className="text-xs text-[var(--color-ink-secondary)]">{assessment.note || `${assessment.algorithm.toUpperCase()} assessment`}</div></div><EventTime value={assessment.performedAt} /></div>)}
      </div>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={className}><span className={labelClass}>{label}</span>{children}</label>;
}

function TimelinePanel({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const items = useMemo(() => Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [], [children]);
  return <section className="card"><h2 className="mb-2 text-sm font-semibold">{title}</h2>{items.length === 0 ? <p className="text-sm text-[var(--color-ink-secondary)]">{empty}</p> : <div className="space-y-2">{children}</div>}</section>;
}
