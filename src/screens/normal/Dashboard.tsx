import { useEffect, useMemo, useRef, useState, type ComponentType, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  BedDouble,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  Route,
  Timer,
  UsersRound,
} from "lucide-react";
import {
  useAlerts,
  useAllActiveEncounters,
  useAllEncounters,
  useAllOrderRecords,
  useAllResultRecords,
  useAllVitalsSets,
  useBeds,
  useIncompleteRegistrations,
  useZones,
} from "../../db/hooks";
import type { EncounterView } from "../../db/hooks";
import { sortQueue } from "../../lib/sortQueue";
import { QueueTable } from "../../components/QueueTable";
import { TriageBadge } from "../../components/TriageBadge";
import { isOverdue, triagePalette } from "../../lib/triage";
import { latestVitals, isVitalsOverdue } from "../../lib/vitals";
import { criticalResultRequiresAcknowledgement, isOrderOverdue, resultRequiresAttention } from "../../lib/clinicalWorkflow";
import { useNow } from "../../lib/useNow";
import type { EncounterState, EsiLevel } from "../../types";

const WAITING_STATES: EncounterState[] = ["arrived", "registered", "triaged", "waiting"];
const PENDING_STATES: EncounterState[] = [
  "disposition_pending",
  "admission_pending",
  "transfer_pending",
  "discharge_pending",
];

export function Dashboard() {
  const activeEncounters = useAllActiveEncounters();
  const allEncounters = useAllEncounters();
  const beds = useBeds();
  const zones = useZones();
  const incompleteRegistrations = useIncompleteRegistrations();
  const allVitals = useAllVitalsSets();
  const orders = useAllOrderRecords();
  const results = useAllResultRecords();
  const alerts = useAlerts();
  const navigate = useNavigate();
  const now = useNow();

  const sorted = sortQueue(activeEncounters);
  // Persistent safety count for the priority-queue header: ESI-1 or overdue
  // patients, shown regardless of which page is visible.
  const priorityCriticalCount = sorted.filter(
    (row) => row.triage === 1 || isOverdue(row.triage, row.encounter.arrivedAt),
  ).length;
  const waitingRows = activeEncounters
    .filter((row) => WAITING_STATES.includes(row.encounter.state))
    .sort((a, b) => a.encounter.arrivedAt - b.encounter.arrivedAt);
  const waits = waitingRows.map((row) => minutesSince(row.encounter.arrivedAt, now));
  const averageWait = waits.length ? Math.round(waits.reduce((total, value) => total + value, 0) / waits.length) : 0;
  const longestWait = waits.length ? Math.max(...waits) : 0;
  const inTreatment = activeEncounters.filter((row) => ["in_treatment", "observation"].includes(row.encounter.state)).length;
  const pendingDisposition = activeEncounters.filter((row) => PENDING_STATES.includes(row.encounter.state)).length;
  const occupiedBeds = beds.filter((bed) => bed.encounterId).length;
  const occupancy = beds.length ? Math.round((occupiedBeds / beds.length) * 100) : 0;
  const overdue = waitingRows.filter((row) => isOverdue(row.triage, row.encounter.arrivedAt)).length;
  const arrivalsToday = allEncounters.filter((encounter) => encounter.arrivedAt >= startOfDay(now)).length;
  const closedToday = allEncounters.filter((encounter) => (encounter.closedAt ?? 0) >= startOfDay(now)).length;
  const arrivalBuckets = useMemo(() => buildArrivalBuckets(allEncounters, now), [allEncounters, now]);
  const triageCounts = ([1, 2, 3, 4, 5] as EsiLevel[]).map((level) => ({
    level,
    count: activeEncounters.filter((row) => row.triage === level).length,
  }));
  const vitalsDueCount = activeEncounters.filter((row) => {
    const latest = latestVitals(allVitals.filter((vitals) => vitals.encounterId === row.encounter.id));
    return isVitalsOverdue(latest?.recordedAt ?? null, row.triage, now);
  }).length;
  const overdueLabOrders = orders.filter((order) => order.orderType === "laboratory" && isOrderOverdue(order, now));
  const unreviewedResults = results.filter(resultRequiresAttention);
  const criticalUnreviewedResults = results.filter(criticalResultRequiresAcknowledgement);
  const hasLabAlert = alerts.some((alert) => alert.newValue?.toLowerCase().includes("lab"));
  const operationalAlertCount =
    alerts.length
    + (vitalsDueCount > 3 ? 1 : 0)
    + (incompleteRegistrations.length > 0 ? 1 : 0)
    + (unreviewedResults.length > 0 ? 1 : 0)
    + (overdueLabOrders.length > 0 && !hasLabAlert ? 1 : 0);

  return (
    <main className="dashboard-page">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Operations dashboard</h1>
          <p className="text-xs text-[var(--color-ink-secondary)]">
            {arrivalsToday} arrivals today | {closedToday} encounters closed | Updated {new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <button
          className="flex min-h-10 items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white"
          onClick={() => navigate("/patients/new")}
        >
          <Plus size={16} />
          New patient
        </button>
      </header>

      <section className="dashboard-kpi-grid" aria-label="Emergency department key performance indicators">
        <MetricCard icon={UsersRound} label="Waiting now" value={String(waitingRows.length)} context={`${overdue} overdue`} accent={overdue > 0 ? "var(--color-red-solid)" : "var(--color-primary)"} emphasis={overdue > 0 ? "critical" : undefined} onClick={() => navigate("/queue?view=waiting")} />
        <MetricCard icon={Clock3} label="Average wait" value={formatMinutes(averageWait)} context="Current waiting patients" accent="var(--color-teal-solid)" onClick={() => navigate("/queue?view=waiting")} />
        <MetricCard icon={Timer} label="Longest wait" value={formatMinutes(longestWait)} context={waitingRows[0]?.patient.name ?? waitingRows[0]?.patient.displayNumber ?? "No queue"} contextIsName accent="var(--color-yellow-solid)" onClick={() => navigate("/queue?overdue=1")} />
        <MetricCard icon={Activity} label="In treatment" value={String(inTreatment)} context={`${activeEncounters.length} active encounters`} accent="var(--color-green-solid)" onClick={() => navigate("/queue?status=in_treatment")} />
        <MetricCard icon={BedDouble} label="Bed occupancy" value={`${occupancy}%`} context={`${beds.length - occupiedBeds} beds open`} accent={occupancy >= 85 ? "var(--color-red-solid)" : "var(--color-primary)"} emphasis={occupancy >= 85 ? "critical" : undefined} onClick={() => navigate("/beds")} />
        <MetricCard icon={Route} label="Disposition pending" value={String(pendingDisposition)} context="Admission, transfer, discharge" accent="var(--color-purple-ai)" onClick={() => navigate("/queue?view=disposition-pending")} />
        <MetricCard icon={UsersRound} label="Incomplete regs" value={String(incompleteRegistrations.length)} context="Complete later worklist" accent="var(--color-yellow-solid)" onClick={() => navigate("/patients")} />
        <MetricCard icon={Activity} label="Vitals due" value={String(vitalsDueCount)} context={vitalsDueCount > 3 ? "Dashboard alert active" : "Repeat schedule"} accent={vitalsDueCount > 3 ? "var(--color-red-solid)" : "var(--color-teal-solid)"} emphasis={vitalsDueCount > 3 ? "critical" : undefined} onClick={() => navigate("/vitals-due")} />
      </section>

      <div className="dashboard-overview-grid">
        <section className={`dashboard-panel dashboard-alerts-panel ${vitalsDueCount > 3 ? "dashboard-panel-critical" : operationalAlertCount > 0 ? "dashboard-panel-warning" : ""}`}>
          <SectionHeader title="Operational alerts" detail={`${operationalAlertCount} active`} />
          {operationalAlertCount === 0 ? (
            <p className="dashboard-clear-state">No active alerts.</p>
          ) : (
            <div className="dashboard-alert-list" aria-live="polite">
              {vitalsDueCount > 3 && (
                <button onClick={() => navigate("/vitals-due")} className="dashboard-alert dashboard-alert-critical">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>{vitalsDueCount} patients overdue for repeat vitals</span>
                </button>
              )}
              {criticalUnreviewedResults.length > 0 ? (
                <button onClick={() => navigate("/results?view=critical&review=requires_attention")} className="dashboard-alert dashboard-alert-critical">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>{criticalUnreviewedResults.length} critical {criticalUnreviewedResults.length === 1 ? "result requires" : "results require"} acknowledgement</span>
                </button>
              ) : unreviewedResults.length > 0 ? (
                <button onClick={() => navigate("/results")} className="dashboard-alert dashboard-alert-warning">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>New results awaiting review: {unreviewedResults.length}</span>
                </button>
              ) : null}
              {overdueLabOrders.length > 0 && !hasLabAlert && (
                <button onClick={() => navigate("/orders?category=laboratory&overdue=1")} className="dashboard-alert dashboard-alert-warning">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>Laboratory orders overdue: {overdueLabOrders.length}</span>
                </button>
              )}
              {alerts.map((alert) => {
                const message = alert.newValue ?? "Operational alert";
                const destination = dashboardAlertDestination(message);
                const content = <><AlertCircle size={15} className="mt-0.5 shrink-0" /><span>{message}</span></>;
                return destination ? (
                  <button key={alert.id} type="button" onClick={() => navigate(destination)} className="dashboard-alert dashboard-alert-warning">
                    {content}
                  </button>
                ) : (
                  <div key={alert.id} className="dashboard-alert dashboard-alert-warning">{content}</div>
                );
              })}
              {incompleteRegistrations.length > 0 && (
                <button onClick={() => navigate("/patients")} className="dashboard-alert dashboard-alert-warning">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>Incomplete registrations: {incompleteRegistrations.length}</span>
                </button>
              )}
            </div>
          )}
        </section>

        <section className="dashboard-panel min-w-0">
          <SectionHeader title="Arrival volume" detail="Last 8 hours" />
          <ArrivalChart buckets={arrivalBuckets} />
        </section>

        <section className="dashboard-panel">
          <SectionHeader title="Triage mix" detail={`${activeEncounters.length} active`} />
          <div className="space-y-1.5" role="list" aria-label="Active encounters by ESI level">
            {triageCounts.map(({ level, count }) => {
              const palette = triagePalette(level);
              const percentage = activeEncounters.length ? (count / activeEncounters.length) * 100 : 0;
              return (
                <button key={level} type="button" role="listitem" onClick={() => navigate(`/queue?esi=${level}`)} className="grid w-full grid-cols-[52px_1fr_26px] items-center gap-1.5 rounded-sm text-left hover:bg-[var(--color-surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]">
                  <TriageBadge level={level} size="sm" />
                  <div className="h-2 overflow-hidden rounded bg-[var(--color-surface-muted)]" role="progressbar" aria-label={`ESI ${level}: ${count} active encounters`} aria-valuemin={0} aria-valuemax={Math.max(1, activeEncounters.length)} aria-valuenow={count}>
                    <div className="h-full rounded-full" style={{ width: `${percentage}%`, background: palette.solid }} />
                  </div>
                  <span className="text-right text-xs font-semibold tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="dashboard-panel">
          <SectionHeader title="Beds and zones" detail={`${occupancy}% occupied`} />
          {zones.length === 0 ? (
            <p className="dashboard-clear-state">No bed zones configured.</p>
          ) : (
            <div className="space-y-1.5">
              {zones.map((zone) => {
                const zoneBeds = beds.filter((bed) => bed.zone === zone.id);
                const zoneOccupied = zoneBeds.filter((bed) => bed.encounterId).length;
                const percentage = zoneBeds.length ? (zoneOccupied / zoneBeds.length) * 100 : 0;
                const color = percentage >= 100 ? "var(--color-red-solid)" : percentage >= 70 ? "var(--color-yellow-solid)" : "var(--color-green-solid)";
                return (
                  <button key={zone.id} type="button" onClick={() => navigate("/beds")} className="block w-full rounded-sm text-left hover:bg-[var(--color-surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]">
                    <div className="mb-0.5 flex justify-between gap-2 text-xs">
                      <span className="truncate font-semibold">{zone.name}</span>
                      <span className="shrink-0 tabular-nums text-[var(--color-ink-secondary)]">{zoneOccupied}/{zoneBeds.length} occupied | {zoneBeds.length - zoneOccupied} open</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded bg-[var(--color-surface-muted)]" role="progressbar" aria-label={`${zone.name}: ${zoneOccupied} of ${zoneBeds.length} beds occupied`} aria-valuemin={0} aria-valuemax={Math.max(1, zoneBeds.length)} aria-valuenow={zoneOccupied}>
                      <div className="h-full rounded" style={{ width: `${percentage}%`, background: color }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <div className="dashboard-work-grid">
        <PriorityQueuePanel rows={sorted} criticalCount={priorityCriticalCount} />
        <WaitingLongestPanel rows={waitingRows} now={now} />
      </div>
    </main>
  );
}

// Bounded, paginated priority-queue panel. Fixed header + column headers stay
// put; only the row area is bounded to the freed height and paged via a footer
// pager. The critical (ESI-1 / overdue) count stays in the header on every page.
function PriorityQueuePanel({ rows, criticalCount }: { rows: EncounterView[]; criticalCount: number }) {
  const rowAreaRef = useRef<HTMLDivElement>(null);
  // Compact queue rows are ~51px (two text lines); reserve ~30px for the sticky
  // column-header row that lives inside the measured area.
  const perPage = useRowsPerPage(rowAreaRef, 51, 8, 30);
  const { page, totalPages, pageItems, setPage } = usePagination(rows, perPage);
  return (
    <section className="dashboard-panel dashboard-work-panel min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Priority queue</h2>
          {criticalCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-[var(--color-red-tint)] px-1.5 py-0.5 text-xs font-bold text-[var(--color-red-text)]" title="ESI-1 or overdue patients">
              <AlertCircle size={12} /> {criticalCount} critical
            </span>
          )}
        </div>
        <span className="text-xs text-[var(--color-ink-secondary)]">{rows.length} active</span>
      </div>
      <div ref={rowAreaRef} className="dashboard-work-rows">
        <QueueTable rows={pageItems} compact stickyHeader />
      </div>
      <Pager page={page} totalPages={totalPages} total={rows.length} unit="active" onPage={setPage} />
    </section>
  );
}

function WaitingLongestPanel({ rows, now }: { rows: EncounterView[]; now: number }) {
  const navigate = useNavigate();
  const rowAreaRef = useRef<HTMLDivElement>(null);
  const perPage = useRowsPerPage(rowAreaRef, 46, 5);
  const { page, totalPages, pageItems, setPage, pageStart } = usePagination(rows, perPage);
  return (
    <section className="dashboard-panel dashboard-work-panel">
      <SectionHeader title="Waiting longest" detail={`${rows.length} waiting`} />
      {rows.length === 0 ? (
        <div ref={rowAreaRef} className="dashboard-work-rows flex items-center justify-center border-0">
          <p className="dashboard-clear-state">No patients currently waiting.</p>
        </div>
      ) : (
        <div ref={rowAreaRef} className="dashboard-work-rows dashboard-work-rows-scroll border-0">
          <div className="space-y-0.5">
            {pageItems.map((row, index) => {
              const rowOverdue = isOverdue(row.triage, row.encounter.arrivedAt);
              return (
                <button
                  key={row.encounter.id}
                  onClick={() => navigate(`/patients/${row.encounter.id}`)}
                  className={`grid min-h-11 w-full grid-cols-[24px_58px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-md px-1.5 py-1 text-left ${rowOverdue ? "bg-[var(--color-red-tint)] hover:bg-[var(--color-red-tint)]" : "hover:bg-[var(--color-primary-tint)]"}`}
                >
                  <span className="text-xs font-bold tabular-nums text-[var(--color-ink-secondary)]">{pageStart + index + 1}</span>
                  <TriageBadge level={row.triage} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{row.patient.name ?? row.patient.displayNumber}</span>
                    <span className="block truncate text-xs text-[var(--color-ink-secondary)]">{row.encounter.chiefComplaint ?? row.encounter.currentLocationName ?? "No complaint"}</span>
                  </span>
                  <span className={rowOverdue ? "text-xs font-bold tabular-nums text-[var(--color-red-solid)]" : "text-xs font-semibold tabular-nums"}>
                    {formatMinutes(minutesSince(row.encounter.arrivedAt, now))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {rows.length > 0 && <Pager page={page} totalPages={totalPages} total={rows.length} unit="waiting" onPage={setPage} />}
    </section>
  );
}

function Pager({ page, totalPages, total, unit, onPage }: { page: number; totalPages: number; total: number; unit: string; onPage: (page: number) => void }) {
  return (
    <div className="dashboard-pager">
      <span className="tabular-nums">Page {page + 1} of {totalPages} · {total} {unit}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" className="dashboard-pager-button" onClick={() => onPage(page - 1)} disabled={page <= 0} aria-label="Previous page">
          <ChevronLeft size={14} /> Prev
        </button>
        <button type="button" className="dashboard-pager-button" onClick={() => onPage(page + 1)} disabled={page >= totalPages - 1} aria-label="Next page">
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// Page over a list with a stable page index that survives live re-renders.
// Clamps when the list shrinks so a refresh never lands on an empty page.
function usePagination<T>(items: T[], perPage: number) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const clampedPage = Math.min(page, totalPages - 1);
  useEffect(() => {
    if (page !== clampedPage) setPage(clampedPage);
  }, [page, clampedPage]);
  const pageStart = clampedPage * perPage;
  const pageItems = items.slice(pageStart, pageStart + perPage);
  return { page: clampedPage, totalPages, pageItems, pageStart, setPage: (next: number) => setPage(Math.max(0, next)) };
}

// Measure the bounded row area and derive how many rows fit, so the queue fills
// the freed height (aiming for the 8-10 visible target) instead of a fixed cap.
// headerAllowance reserves space for a sticky column-header row that lives inside
// the measured area.
function useRowsPerPage(ref: RefObject<HTMLElement | null>, rowHeight: number, fallback: number, headerAllowance = 0) {
  const [perPage, setPerPage] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const available = element.clientHeight - headerAllowance;
      if (available > 0) setPerPage(Math.max(1, Math.floor(available / rowHeight)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rowHeight, headerAllowance]);
  return perPage;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  context,
  accent,
  emphasis,
  contextIsName = false,
  onClick,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  context: string;
  accent: string;
  emphasis?: "critical";
  // When the context is a free-text value (e.g. a patient name) it may be
  // arbitrarily long; truncate it gracefully with a tooltip. Descriptive
  // context labels always wrap and are shown in full.
  contextIsName?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`dashboard-kpi ${emphasis === "critical" ? "dashboard-kpi-critical" : ""}`}
      style={{ borderLeftColor: accent }}
      aria-label={`${label}: ${value}. ${context}`}
    >
      <strong className="dashboard-kpi-value" style={{ color: accent }}>{value}</strong>
      <div className="flex min-w-0 items-center gap-1 self-end text-[11px] font-bold uppercase leading-none text-[var(--color-ink-secondary)]">
        <Icon size={12} className="shrink-0" />
        <span className="truncate" title={label}>{label}</span>
      </div>
      <span
        className={`self-start text-xs leading-tight text-[var(--color-ink-secondary)] ${contextIsName ? "block truncate" : "dashboard-kpi-context"}`}
        title={context}
      >
        {context}
      </span>
    </Tag>
  );
}

function SectionHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <span className="text-xs text-[var(--color-ink-secondary)]">{detail}</span>
    </div>
  );
}

interface ArrivalBucket {
  label: string;
  count: number;
}

function ArrivalChart({ buckets }: { buckets: ArrivalBucket[] }) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const accessibleSummary = buckets.map((bucket) => `${bucket.label}: ${bucket.count}`).join(", ");
  return (
    <div className="dashboard-arrival-chart" role="img" aria-label={`Arrivals per hour. ${accessibleSummary}`}>
      {buckets.map((bucket) => (
        <div key={bucket.label} className="flex h-full min-w-0 flex-col justify-end gap-1 text-center">
          <span className="text-xs font-semibold tabular-nums">{bucket.count}</span>
          <div className="mx-auto w-[72%] max-w-12 rounded-t-sm bg-[var(--color-primary)] transition-[height]" style={{ height: `${Math.max(bucket.count ? 8 : 2, (bucket.count / max) * 62)}px`, opacity: bucket.count ? 1 : 0.22 }} aria-hidden="true" />
          <span className="truncate text-xs text-[var(--color-ink-secondary)]">{bucket.label}</span>
        </div>
      ))}
    </div>
  );
}

function buildArrivalBuckets(encounters: { arrivedAt: number }[], now: number): ArrivalBucket[] {
  const currentHour = new Date(now);
  currentHour.setMinutes(0, 0, 0);
  return Array.from({ length: 8 }, (_, index) => {
    const start = currentHour.getTime() - (7 - index) * 60 * 60 * 1000;
    const end = start + 60 * 60 * 1000;
    return {
      label: new Date(start).toLocaleTimeString([], { hour: "numeric" }),
      count: encounters.filter((encounter) => encounter.arrivedAt >= start && encounter.arrivedAt < end).length,
    };
  });
}

function minutesSince(timestamp: number, now: number) {
  return Math.max(0, Math.floor((now - timestamp) / 60000));
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${remainder}m`;
}

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dashboardAlertDestination(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("lab")) return "/orders?category=laboratory&overdue=1";
  if (normalized.includes("vital")) return "/vitals-due";
  if (normalized.includes("registration")) return "/patients";
  if (normalized.includes("result")) return "/results";
  return null;
}
