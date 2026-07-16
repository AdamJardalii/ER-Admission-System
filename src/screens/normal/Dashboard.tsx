import { useMemo, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  BedDouble,
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
        <MetricCard icon={Timer} label="Longest wait" value={formatMinutes(longestWait)} context={waitingRows[0]?.patient.name ?? waitingRows[0]?.patient.displayNumber ?? "No queue"} accent="var(--color-yellow-solid)" onClick={() => navigate("/queue?overdue=1")} />
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
        <section className="dashboard-panel min-w-0">
          <SectionHeader title="Priority queue" detail={`${activeEncounters.length} active`} />
          <div className="dashboard-queue-scroll">
            <QueueTable rows={sorted} compact stickyHeader />
          </div>
        </section>

        <section className="dashboard-panel">
          <SectionHeader title="Waiting longest" detail={`${waitingRows.length} waiting`} />
          {waitingRows.length === 0 ? (
            <p className="dashboard-clear-state">No patients currently waiting.</p>
          ) : (
            <div className="space-y-0.5">
              {waitingRows.slice(0, 5).map((row, index) => {
                const rowOverdue = isOverdue(row.triage, row.encounter.arrivedAt);
                return (
                  <button
                    key={row.encounter.id}
                    onClick={() => navigate(`/patients/${row.encounter.id}`)}
                    className={`grid min-h-11 w-full grid-cols-[20px_58px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-md px-1.5 py-1 text-left ${rowOverdue ? "bg-[var(--color-red-tint)] hover:bg-[var(--color-red-tint)]" : "hover:bg-[var(--color-primary-tint)]"}`}
                  >
                    <span className="text-xs font-bold tabular-nums text-[var(--color-ink-secondary)]">{index + 1}</span>
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
          )}
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  context,
  accent,
  emphasis,
  onClick,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  context: string;
  accent: string;
  emphasis?: "critical";
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
      <div className="flex min-w-0 items-center gap-1.5 text-xs font-bold uppercase text-[var(--color-ink-secondary)]">
        <Icon size={14} className="shrink-0" />
        <span className="truncate" title={label}>{label}</span>
      </div>
      <div className="mt-1 flex min-w-0 items-baseline gap-2">
        <strong className="shrink-0 text-xl leading-none tabular-nums" style={{ color: accent }}>{value}</strong>
        <span className="min-w-0 truncate text-xs text-[var(--color-ink-secondary)]" title={context}>{context}</span>
      </div>
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
