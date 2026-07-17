import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, MoreVertical, Plus, Search } from "lucide-react";
import { ClinicalWorklist } from "../../components/ClinicalWorklist";
import { ClinicalAuditHistory } from "../../components/ClinicalAuditHistory";
import { StatusPill } from "../../components/DomainTab";
import { TriageBadge } from "../../components/TriageBadge";
import { addOrderRecord, administerMedication, transitionOrderRecordStatus } from "../../db/repo";
import { isOrderOverdue, isOrderTerminal, resultReviewStatus } from "../../lib/clinicalWorkflow";
import { orderOptionsFor } from "../../lib/clinicalCatalog";
import { useNow } from "../../lib/useNow";
import { useAppStore } from "../../store/useAppStore";
import type { AuditEvent, Encounter, OrderRecord, OrderStatus, OrderType, Patient, ResultRecord, TriageLevel } from "../../types";
import { useClinicalWorkspaceSnapshot } from "./clinical/useClinicalWorkspaceSnapshot";

const ORDER_TYPES: OrderType[] = [
  "laboratory",
  "imaging",
  "medication",
  "consultation",
  "procedure",
  "treatment",
  "nursing",
  "blood_product",
  "monitoring",
  "observation",
  "admission",
  "transfer",
  "other",
];

const ORDER_STATUSES: OrderStatus[] = [
  "draft",
  "ordered",
  "acknowledged",
  "scheduled",
  "specimen_pending",
  "specimen_collected",
  "in_progress",
  "completed",
  "result_available",
  "reviewed",
  "cancelled",
  "rejected",
  "failed",
  "patient_refused",
];

const ORDER_ENTRY_TYPES = ORDER_TYPES;

type OrderDraft = {
  encounterId: string;
  orderType: OrderType;
  name: string;
  priority: OrderRecord["priority"];
  clinicalIndication: string;
  instructions: string;
  requestedDepartment: string;
  actor: string;
};

const EMPTY_DRAFT: OrderDraft = {
  encounterId: "",
  orderType: "laboratory",
  name: "",
  priority: "routine",
  clinicalIndication: "",
  instructions: "",
  requestedDepartment: "Laboratory",
  actor: "Demo Provider",
};

export function OrdersWorkspace() {
  const { patientId: routePatientId } = useParams<{ patientId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = useAppStore((state) => state.mode);
  const pushToast = useAppStore((state) => state.pushToast);
  const now = useNow();
  const snapshot = useClinicalWorkspaceSnapshot();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<OrderDraft>(EMPTY_DRAFT);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuOrderId, setMenuOrderId] = useState<string | null>(null);
  const rowMenuRef = useRef<HTMLDivElement>(null);

  const patientById = useMemo(() => new Map(snapshot.data.patients.map((patient) => [patient.id, patient])), [snapshot.data.patients]);
  const encounterById = useMemo(() => new Map(snapshot.data.encounters.map((encounter) => [encounter.id, encounter])), [snapshot.data.encounters]);
  const resultByOrderId = useMemo(() => {
    const map = new Map<string, ResultRecord>();
    for (const result of [...snapshot.data.results].sort((a, b) => a.resultedAt - b.resultedAt)) {
      if (result.orderId) map.set(result.orderId, result);
    }
    return map;
  }, [snapshot.data.results]);
  const triageByEncounter = useMemo(() => latestTriageMap(snapshot.data.triageAssessments), [snapshot.data.triageAssessments]);
  const availableEncounters = useMemo(
    () => snapshot.data.encounters
      .filter((encounter) => !routePatientId || encounter.patientId === routePatientId)
      .sort((a, b) => b.arrivedAt - a.arrivedAt),
    [routePatientId, snapshot.data.encounters],
  );
  const departmentOptions = useMemo(
    () => unique(snapshot.data.orders.map((order) => order.requestedDepartment ?? departmentFor(order.orderType))),
    [snapshot.data.orders],
  );
  const locationOptions = useMemo(
    () => unique(snapshot.data.encounters.map((encounter) => encounter.currentLocationName).filter((value): value is string => Boolean(value))),
    [snapshot.data.encounters],
  );
  const clinicianOptions = useMemo(
    () => unique(snapshot.data.orders.map((order) => order.actor).filter((value): value is string => Boolean(value))),
    [snapshot.data.orders],
  );

  const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const categoryParam = searchParams.get("category") ?? "all";
  const category = categoryParam === "lab" ? "laboratory" : categoryParam;
  const statusParam = searchParams.get("status") ?? "all";
  const status = statusParam === "overdue" ? "all" : statusParam;
  const priority = searchParams.get("priority") ?? "all";
  const department = searchParams.get("department") ?? "all";
  const location = searchParams.get("location") ?? "all";
  const clinician = searchParams.get("clinician") ?? "all";
  const timeRange = searchParams.get("time") ?? "all";
  const myOrdersOnly = searchParams.get("mine") === "1";
  const view = searchParams.get("view") ?? "active";
  const overdueOnly = searchParams.get("overdue") === "1" || statusParam === "overdue";
  const rows = useMemo(() => snapshot.data.orders.filter((order) => {
    if (routePatientId && order.patientId !== routePatientId) return false;
    const patient = patientById.get(order.patientId);
    const encounter = encounterById.get(order.encounterId);
    const searchable = `${patient?.name ?? ""} ${patient?.mrn ?? patient?.displayNumber ?? ""} ${encounter?.caseNumber ?? ""} ${order.name} ${order.details ?? ""}`.toLowerCase();
    if (query && !searchable.includes(query)) return false;
    if (category !== "all" && order.orderType !== category) return false;
    if (status !== "all" && order.status !== status) return false;
    if (priority !== "all" && order.priority !== priority) return false;
    if (department !== "all" && (order.requestedDepartment ?? departmentFor(order.orderType)) !== department) return false;
    if (location !== "all" && encounter?.currentLocationName !== location) return false;
    if (clinician !== "all" && order.actor !== clinician) return false;
    if (myOrdersOnly && order.actor !== "Demo Provider") return false;
    if (timeRange !== "all" && order.orderedAt < timeRangeStart(timeRange, now)) return false;
    if (overdueOnly && !isOrderOverdue(order, now)) return false;
    if (status === "all" && view === "active" && isOrderTerminal(order.status)) return false;
    if (status === "all" && view === "result_available" && order.status !== "result_available") return false;
    if (status === "all" && view === "completed" && !["completed", "reviewed"].includes(order.status)) return false;
    if (status === "all" && view === "cancelled" && order.status !== "cancelled") return false;
    return true;
  }).sort((a, b) => {
    const overdueDelta = Number(isOrderOverdue(b, now)) - Number(isOrderOverdue(a, now));
    if (overdueDelta) return overdueDelta;
    const priorityDelta = priorityRank(b.priority) - priorityRank(a.priority);
    return priorityDelta || a.orderedAt - b.orderedAt;
  }), [category, clinician, department, encounterById, location, myOrdersOnly, now, overdueOnly, patientById, priority, query, routePatientId, snapshot.data.orders, status, timeRange, view]);

  const selectedOrder = selectedId ? snapshot.data.orders.find((order) => order.id === selectedId) ?? null : null;
  const orderableOptions = orderOptionsFor(draft.orderType);

  useEffect(() => {
    if (searchParams.get("create") !== "1" || snapshot.loading) return;
    const requestedEncounter = searchParams.get("encounterId");
    const encounterId = availableEncounters.some((encounter) => encounter.id === requestedEncounter)
      ? requestedEncounter ?? ""
      : availableEncounters[0]?.id ?? "";
    setDraft({ ...EMPTY_DRAFT, encounterId });
    setSelectedId(null);
    setCreateOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("create");
    next.delete("encounterId");
    setSearchParams(next, { replace: true });
  }, [availableEncounters, searchParams, setSearchParams, snapshot.loading]);

  useEffect(() => {
    if (!menuOrderId) return undefined;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (rowMenuRef.current && !rowMenuRef.current.contains(event.target as Node)) setMenuOrderId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOrderId(null);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOrderId]);

  function setFilter(key: string, value: string, replace = false) {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "all" || (key === "view" && value === "active")) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace });
  }

  function clearFilters() {
    setSearchParams({}, { replace: false });
  }

  function openCreateOrder() {
    const encounterId = availableEncounters[0]?.id ?? "";
    setDraft({ ...EMPTY_DRAFT, encounterId });
    setSelectedId(null);
    setCreateOpen(true);
  }

  async function createOrder() {
    const encounter = encounterById.get(draft.encounterId);
    if (!encounter || !draft.name.trim()) return;
    setBusyId("create");
    try {
      const order = await addOrderRecord({
        encounterId: encounter.id,
        patientId: encounter.patientId,
        orderType: draft.orderType,
        name: draft.name.trim(),
        details: draft.instructions.trim() || null,
        priority: draft.priority,
        status: "ordered",
        actor: draft.actor.trim() || "Demo Provider",
        requestedDepartment: draft.requestedDepartment.trim() || null,
        clinicalIndication: draft.clinicalIndication.trim() || null,
        instructions: draft.instructions.trim() || null,
      }, mode);
      pushToast("Order created");
      setCreateOpen(false);
      setSelectedId(order.id);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Order could not be created");
    } finally {
      setBusyId(null);
    }
  }

  async function advanceOrder(order: OrderRecord) {
    const action = nextOrderAction(order, resultByOrderId.has(order.id));
    if (!action) return;
    if (action.navigateToResults) {
      navigate(`/results?view=all&orderId=${order.id}`);
      return;
    }
    setBusyId(order.id);
    try {
      await transitionOrderRecordStatus(order.id, action.status, "Demo Provider", mode);
      pushToast(`Order ${action.status.replace(/_/g, " ")}`);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Order status could not be updated");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelOrder(order: OrderRecord) {
    const reason = window.prompt("Reason for cancelling this order:");
    if (reason === null) return;
    if (!reason.trim()) {
      pushToast("A cancellation reason is required");
      return;
    }
    setMenuOrderId(null);
    setBusyId(order.id);
    try {
      await transitionOrderRecordStatus(order.id, "cancelled", "Demo Provider", mode, reason);
      pushToast("Order cancelled");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Order could not be cancelled");
    } finally {
      setBusyId(null);
    }
  }

  const filters = (
    <>
      <label className="clinical-filter-search">
        <span className="sr-only">Search orders</span>
        <Search size={15} />
        <input value={searchParams.get("q") ?? ""} onChange={(event) => setFilter("q", event.target.value, true)} placeholder="Patient, MRN, case, or order" />
      </label>
      <FilterSelect label="View" value={view} options={["active", "all", "result_available", "completed", "cancelled"]} onChange={(value) => setFilter("view", value)} />
      <FilterSelect label="Category" value={category} options={["all", ...ORDER_TYPES]} onChange={(value) => setFilter("category", value)} />
      <FilterSelect label="Status" value={status} options={["all", ...ORDER_STATUSES]} onChange={(value) => setFilter("status", value)} />
      <FilterSelect label="Priority" value={priority} options={["all", "stat", "urgent", "routine"]} onChange={(value) => setFilter("priority", value)} />
      <FilterSelect label="Department" value={department} options={["all", ...departmentOptions]} onChange={(value) => setFilter("department", value)} />
      <FilterSelect label="Location" value={location} options={["all", ...locationOptions]} onChange={(value) => setFilter("location", value)} />
      <FilterSelect label="Clinician" value={clinician} options={["all", ...clinicianOptions]} onChange={(value) => setFilter("clinician", value)} />
      <FilterSelect label="Time" value={timeRange} options={["all", "4h", "12h", "24h", "today"]} onChange={(value) => setFilter("time", value)} />
      <label className="clinical-filter-check"><input type="checkbox" checked={overdueOnly} onChange={(event) => setFilter("overdue", event.target.checked ? "1" : "")} /> Overdue only</label>
      <label className="clinical-filter-check"><input type="checkbox" checked={myOrdersOnly} onChange={(event) => setFilter("mine", event.target.checked ? "1" : "")} /> My orders</label>
      {(searchParams.size > 0) && <button type="button" onClick={clearFilters} className="clinical-filter-clear">Clear filters</button>}
    </>
  );

  const drawer = createOpen ? (
    <OrderEntryForm
      draft={draft}
      encounters={availableEncounters}
      patientById={patientById}
      orderableOptions={orderableOptions}
      saving={busyId === "create"}
      onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
      onSave={() => void createOrder()}
    />
  ) : selectedOrder ? (
    <OrderDetails
      order={selectedOrder}
      result={resultByOrderId.get(selectedOrder.id)}
      history={snapshot.data.auditEvents.filter((event) => event.entityType === "order_record" && event.entityId === selectedOrder.id)}
      patient={patientById.get(selectedOrder.patientId)}
      encounter={encounterById.get(selectedOrder.encounterId)}
      triage={triageByEncounter.get(selectedOrder.encounterId) ?? null}
      busy={busyId === selectedOrder.id}
      onAdvance={() => void advanceOrder(selectedOrder)}
      onCancel={() => void cancelOrder(selectedOrder)}
      onOpenChart={() => navigate(`/patients/${selectedOrder.encounterId}?tab=Orders`)}
    />
  ) : undefined;

  return (
    <ClinicalWorklist
      title={routePatientId ? "Patient orders" : "Orders"}
      description="Active clinical requests across emergency encounters"
      count={rows.length}
      updatedAt={snapshot.updatedAt}
      primaryAction={{ label: "Create order", icon: <Plus size={16} />, onClick: openCreateOrder }}
      filters={filters}
      filtersActive={searchParams.size > 0}
      loading={snapshot.loading}
      error={snapshot.error}
      onRetry={snapshot.retry}
      emptyMessage="No orders match the current filters."
      hasRows={rows.length > 0}
      drawer={drawer}
      onCloseDrawer={() => { setCreateOpen(false); setSelectedId(null); }}
    >
      <div className="clinical-table-scroll">
        <table className="clinical-table min-w-[1160px]">
          <thead><tr><th>Priority</th><th>Patient</th><th>Order</th><th>Category</th><th>Ordered / elapsed</th><th>Clinician / department</th><th>Location</th><th>Status</th><th>Result state</th><th className="text-right">Action</th></tr></thead>
          <tbody>
            {rows.map((order) => {
              const patient = patientById.get(order.patientId);
              const encounter = encounterById.get(order.encounterId);
              const result = resultByOrderId.get(order.id);
              const action = nextOrderAction(order, Boolean(result));
              const overdue = isOrderOverdue(order, now);
              return (
                <tr key={order.id} className={overdue ? "clinical-row-overdue" : undefined}>
                  <td><StatusPill label={order.priority} tone={order.priority === "stat" ? "red" : order.priority === "urgent" ? "yellow" : "neutral"} /></td>
                  <td><button type="button" onClick={() => { setCreateOpen(false); setSelectedId(order.id); }} className="clinical-patient-link"><strong>{patient?.name ?? patient?.displayNumber ?? "Unknown patient"}</strong><span>{patient?.mrn ?? "No MRN"} | {encounter?.caseNumber ?? "No case"}</span></button></td>
                  <td><strong>{order.name}</strong><span className="clinical-cell-meta">{order.clinicalIndication ?? order.details ?? "No indication recorded"}</span></td>
                  <td><StatusPill label={order.orderType} tone="primary" /></td>
                  <td><span>{formatDateTime(order.orderedAt)}</span><span className={overdue ? "clinical-cell-meta text-[var(--color-red-solid)]" : "clinical-cell-meta"}>{formatElapsed(order.orderedAt, now)}{overdue ? " overdue" : ""}</span></td>
                  <td><span>{order.actor ?? "Unassigned"}</span><span className="clinical-cell-meta">{order.requestedDepartment ?? departmentFor(order.orderType)}</span></td>
                  <td>{encounter?.currentLocationName ?? "Unassigned"}</td>
                  <td><StatusPill label={order.status} tone={statusTone(order.status)} /></td>
                  <td>{result ? <StatusPill label={resultReviewStatus(result)} tone={resultReviewTone(result)} /> : <span className="text-xs text-[var(--color-ink-secondary)]">Not available</span>}</td>
                  <td className="text-right"><div className="clinical-row-actions">{action && <button type="button" disabled={busyId === order.id} onClick={() => void advanceOrder(order)} className="clinical-row-primary">{action.label}<ArrowRight size={14} /></button>}<div ref={menuOrderId === order.id ? rowMenuRef : undefined} className="relative"><button type="button" onClick={() => setMenuOrderId((current) => current === order.id ? null : order.id)} className="clinical-icon-button" aria-label={`More actions for ${order.name}`} title="More actions" aria-haspopup="menu" aria-controls={`order-menu-${order.id}`} aria-expanded={menuOrderId === order.id}><MoreVertical size={17} /></button>{menuOrderId === order.id && <div id={`order-menu-${order.id}`} role="menu" className="clinical-row-menu"><button role="menuitem" type="button" onClick={() => { setMenuOrderId(null); setSelectedId(order.id); }}>Open details</button>{canCancel(order) && <button role="menuitem" type="button" onClick={() => void cancelOrder(order)} className="text-[var(--color-red-solid)]">Cancel order</button>}<button role="menuitem" type="button" onClick={() => navigate(`/patients/${order.encounterId}?tab=Orders`)}>Open chart</button></div>}</div></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="clinical-mobile-list">
        {rows.map((order) => {
          const patient = patientById.get(order.patientId);
          const encounter = encounterById.get(order.encounterId);
          const result = resultByOrderId.get(order.id);
          const action = nextOrderAction(order, Boolean(result));
          return (
            <article key={order.id} className="clinical-mobile-row">
              <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1.5"><StatusPill label={order.priority} tone={order.priority === "stat" ? "red" : order.priority === "urgent" ? "yellow" : "neutral"} /><StatusPill label={order.orderType} tone="primary" /></div><span className="text-xs tabular-nums text-[var(--color-ink-secondary)]">{formatElapsed(order.orderedAt, now)}</span></div>
              <strong className="mt-2 block">{patient?.name ?? patient?.displayNumber ?? "Unknown patient"}</strong>
              <span className="text-xs text-[var(--color-ink-secondary)]">{patient?.mrn ?? "No MRN"} | {encounter?.caseNumber ?? "No case"} | {encounter?.currentLocationName ?? "Unassigned"}</span>
              <div className="mt-2 text-sm font-semibold">{order.name}</div>
              <div className="mt-1 flex flex-wrap gap-1.5"><StatusPill label={order.status} tone={statusTone(order.status)} />{result && <StatusPill label={`result ${resultReviewStatus(result)}`} tone={resultReviewTone(result)} />}</div>
              <div className="mt-3 flex gap-2"><button type="button" onClick={() => setSelectedId(order.id)} className="clinical-row-secondary">Open</button>{action && <button type="button" disabled={busyId === order.id} onClick={() => void advanceOrder(order)} className="clinical-row-primary">{action.label}</button>}</div>
            </article>
          );
        })}
      </div>
    </ClinicalWorklist>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="clinical-filter-select"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option.replace(/_/g, " ")}</option>)}</select></label>;
}

function OrderEntryForm({ draft, encounters, patientById, orderableOptions, saving, onChange, onSave }: { draft: OrderDraft; encounters: Encounter[]; patientById: Map<string, Patient>; orderableOptions: string[]; saving: boolean; onChange: (patch: Partial<OrderDraft>) => void; onSave: () => void }) {
  const canSave = Boolean(draft.encounterId && draft.name.trim());
  return <div className="space-y-4"><div><h2 className="text-base font-semibold">Create clinical order</h2><p className="text-xs text-[var(--color-ink-secondary)]">Creating an order requests work. It does not record collection, performance, administration, or review.</p></div><div className="clinical-drawer-form"><label><span>Patient encounter *</span><select value={draft.encounterId} onChange={(event) => onChange({ encounterId: event.target.value })}><option value="">Select encounter</option>{encounters.map((encounter) => { const patient = patientById.get(encounter.patientId); return <option key={encounter.id} value={encounter.id}>{patient?.name ?? patient?.displayNumber ?? "Unknown"} | {encounter.caseNumber}</option>; })}</select></label><label><span>Category *</span><select value={draft.orderType} onChange={(event) => { const orderType = event.target.value as OrderType; onChange({ orderType, name: "", requestedDepartment: departmentFor(orderType) }); }}>{ORDER_ENTRY_TYPES.map((type) => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}</select></label><label className="col-span-2 max-[560px]:col-span-1"><span>Order *</span>{orderableOptions.length ? <select value={draft.name} onChange={(event) => onChange({ name: event.target.value })}><option value="">Select order</option>{orderableOptions.map((option) => <option key={option}>{option}</option>)}</select> : <input value={draft.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="Enter configured order" />}</label><label><span>Priority</span><select value={draft.priority} onChange={(event) => onChange({ priority: event.target.value as OrderRecord["priority"] })}><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="stat">STAT</option></select></label><label><span>Requested department</span><input value={draft.requestedDepartment} onChange={(event) => onChange({ requestedDepartment: event.target.value })} /></label><label className="col-span-2 max-[560px]:col-span-1"><span>Clinical indication</span><textarea rows={2} value={draft.clinicalIndication} onChange={(event) => onChange({ clinicalIndication: event.target.value })} /></label><label className="col-span-2 max-[560px]:col-span-1"><span>Instructions</span><textarea rows={2} value={draft.instructions} onChange={(event) => onChange({ instructions: event.target.value })} /></label><label className="col-span-2 max-[560px]:col-span-1"><span>Ordering clinician</span><input value={draft.actor} onChange={(event) => onChange({ actor: event.target.value })} /></label></div><button type="button" disabled={!canSave || saving} onClick={onSave} className="clinical-drawer-primary">{saving ? "Creating..." : "Create order"}</button></div>;
}

function OrderDetails({ order, result, history, patient, encounter, triage, busy, onAdvance, onCancel, onOpenChart }: { order: OrderRecord; result?: ResultRecord; history: AuditEvent[]; patient?: Patient; encounter?: Encounter; triage: TriageLevel | null; busy: boolean; onAdvance: () => void; onCancel: () => void; onOpenChart: () => void }) {
  const action = nextOrderAction(order, Boolean(result));
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{patient?.name ?? patient?.displayNumber ?? "Unknown patient"}</h2>
        <p className="text-xs text-[var(--color-ink-secondary)]">{patient?.mrn ?? "No MRN"} | {encounter?.caseNumber ?? "No case"}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TriageBadge level={triage} size="sm" />
          <span className="text-sm">{encounter?.currentLocationName ?? "Location unassigned"}</span>
          {encounter?.allergies.length ? <span className="text-sm font-semibold text-[var(--color-red-solid)]">Allergy: {encounter.allergies.join(", ")}</span> : <span className="text-sm text-[var(--color-ink-secondary)]">No encounter allergies</span>}
        </div>
      </div>
      <div className="clinical-detail-section">
        <h3>Order</h3>
        <DetailRow label="Name" value={order.name} />
        <DetailRow label="Category" value={order.orderType.replace(/_/g, " ")} />
        <DetailRow label="Priority" value={order.priority} />
        <DetailRow label="Status" value={order.status.replace(/_/g, " ")} />
        <DetailRow label="Result state" value={result ? resultReviewStatus(result).replace(/_/g, " ") : "Not available"} />
        <DetailRow label="Ordered" value={formatDateTime(order.orderedAt)} />
        <DetailRow label="Ordered by" value={order.actor ?? "Not recorded"} />
        <DetailRow label="Department" value={order.requestedDepartment ?? departmentFor(order.orderType)} />
        <DetailRow label="Indication" value={order.clinicalIndication ?? "Not recorded"} />
        <DetailRow label="Instructions" value={order.instructions ?? order.details ?? "Not recorded"} />
      </div>
      {order.orderType === "medication" && order.status === "in_progress" && <MedicationAdministrationForm order={order} />}
      <ClinicalAuditHistory events={history} title="Order history" />
      <div className="flex flex-wrap gap-2">
        {action && <button type="button" disabled={busy} onClick={onAdvance} className="clinical-drawer-primary">{busy ? "Updating..." : action.label}</button>}
        {canCancel(order) && <button type="button" disabled={busy} onClick={onCancel} className="clinical-drawer-danger">Cancel order</button>}
        <button type="button" onClick={onOpenChart} className="clinical-row-secondary">Open patient chart</button>
      </div>
    </div>
  );
}

function MedicationAdministrationForm({ order }: { order: OrderRecord }) {
  const mode = useAppStore((state) => state.mode);
  const pushToast = useAppStore((state) => state.pushToast);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ dose: "", route: "IV", response: "", reason: "", actor: "Demo Nurse" });

  async function save() {
    if (!form.dose.trim() && !form.reason.trim()) return;
    setSaving(true);
    try {
      await administerMedication(order.encounterId, {
        medicationOrderId: order.id,
        medication: order.name,
        prescribedDose: order.instructions ?? order.details ?? "",
        administeredDose: form.dose.trim(),
        route: form.route.trim(),
        response: form.response.trim(),
        notAdministeredReason: form.reason.trim() || null,
        actor: form.actor.trim() || "Demo Nurse",
      }, mode);
      await transitionOrderRecordStatus(order.id, "completed", form.actor.trim() || "Demo Nurse", mode, form.reason.trim() || "Medication administration documented");
      pushToast(form.reason.trim() ? "Medication non-administration documented" : "Medication administration recorded");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Administration could not be recorded");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="clinical-detail-section">
      <h3>Administration</h3>
      <div className="clinical-drawer-form">
        <label><span>Given dose</span><input value={form.dose} onChange={(event) => setForm({ ...form, dose: event.target.value })} placeholder="500 mg" /></label>
        <label><span>Route</span><input value={form.route} onChange={(event) => setForm({ ...form, route: event.target.value })} /></label>
        <label><span>Response</span><input value={form.response} onChange={(event) => setForm({ ...form, response: event.target.value })} placeholder="Tolerated, pain improved..." /></label>
        <label><span>Administered by</span><input value={form.actor} onChange={(event) => setForm({ ...form, actor: event.target.value })} /></label>
        <label className="col-span-2 max-[560px]:col-span-1"><span>Not given reason</span><input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Required only when not administered" /></label>
      </div>
      <button type="button" disabled={saving || (!form.dose.trim() && !form.reason.trim())} onClick={() => void save()} className="clinical-drawer-primary mt-3">{saving ? "Saving..." : form.reason.trim() ? "Record not given" : "Record administration"}</button>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="clinical-detail-row"><dt>{label}</dt><dd>{value}</dd></div>;
}

function nextOrderAction(order: OrderRecord, hasResult = false): { label: string; status: OrderStatus; navigateToResults?: boolean } | null {
  if (hasResult && ["completed", "result_available", "reviewed"].includes(order.status)) return { label: "Open result", status: "reviewed", navigateToResults: true };
  if (order.status === "draft") return { label: "Place order", status: "ordered" };
  if (order.status === "ordered") return { label: "Accept", status: "acknowledged" };
  if (order.status === "acknowledged" || order.status === "scheduled") {
    return order.orderType === "laboratory" ? { label: "Specimen pending", status: "specimen_pending" } : { label: "Start", status: "in_progress" };
  }
  if (order.status === "specimen_pending") return { label: "Collect specimen", status: "specimen_collected" };
  if (order.status === "specimen_collected") return { label: "Start processing", status: "in_progress" };
  if (order.status === "in_progress") return order.orderType === "medication" ? null : { label: "Complete", status: "completed" };
  if (order.status === "result_available") return { label: "Open result", status: "reviewed", navigateToResults: true };
  return null;
}

function canCancel(order: OrderRecord) {
  return !isOrderTerminal(order.status) && !["completed", "result_available"].includes(order.status);
}

function statusTone(status: OrderStatus): "primary" | "green" | "yellow" | "red" | "neutral" {
  if (["completed", "reviewed"].includes(status)) return "green";
  if (["cancelled", "rejected", "failed", "patient_refused"].includes(status)) return "red";
  if (["ordered", "specimen_pending"].includes(status)) return "yellow";
  return "primary";
}

function resultReviewTone(result: ResultRecord): "primary" | "green" | "yellow" | "red" | "neutral" {
  const status = resultReviewStatus(result);
  if (result.flag === "critical" && status !== "acknowledged") return "red";
  if (["reviewed", "acknowledged"].includes(status)) return "green";
  return status === "action_required" ? "red" : "yellow";
}

function departmentFor(type: OrderType) {
  const departments: Partial<Record<OrderType, string>> = { laboratory: "Laboratory", imaging: "Radiology", medication: "Pharmacy / Nursing", consultation: "Consulting service", procedure: "Procedure team", treatment: "Emergency Department", nursing: "Nursing", blood_product: "Blood bank", admission: "Bed management", transfer: "Transfer center", monitoring: "Nursing" };
  return departments[type] ?? "Emergency Department";
}

function latestTriageMap(rows: Array<{ encounterId: string; level: TriageLevel; performedAt: number }>) {
  const map = new Map<string, TriageLevel>();
  for (const row of [...rows].sort((a, b) => a.performedAt - b.performedAt)) map.set(row.encounterId, row.level);
  return map;
}

function priorityRank(priority: OrderRecord["priority"]) { return priority === "stat" ? 3 : priority === "urgent" ? 2 : 1; }
function unique(values: string[]) { return [...new Set(values)].sort((a, b) => a.localeCompare(b)); }
function timeRangeStart(range: string, now: number) {
  if (range === "4h") return now - 4 * 60 * 60 * 1000;
  if (range === "12h") return now - 12 * 60 * 60 * 1000;
  if (range === "24h") return now - 24 * 60 * 60 * 1000;
  if (range === "today") { const start = new Date(now); start.setHours(0, 0, 0, 0); return start.getTime(); }
  return 0;
}
function formatDateTime(value: number) { return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
function formatElapsed(value: number, now: number) { const minutes = Math.max(0, Math.floor((now - value) / 60_000)); return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }
