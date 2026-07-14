import { useEffect, useMemo, useState, type ComponentType } from "react";
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
  useBeds,
  useZones,
} from "../../db/hooks";
import { sortQueue } from "../../lib/sortQueue";
import { QueueTable } from "../../components/QueueTable";
import { TriageBadge } from "../../components/TriageBadge";
import { isOverdue, triagePalette } from "../../lib/triage";
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

  return (
    <div className="mx-auto max-w-[1600px] space-y-2 p-2.5 max-[680px]:p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Operations dashboard</h1>
          <p className="text-xs text-[var(--color-ink-secondary)]">
            {arrivalsToday} arrivals today | {closedToday} encounters closed
          </p>
        </div>
        <button
          className="flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white"
          onClick={() => navigate("/patients/new")}
        >
          <Plus size={16} />
          New patient
        </button>
      </div>

      <div className="grid grid-cols-6 gap-1.5 max-[1180px]:grid-cols-3 max-[680px]:grid-cols-2">
        <MetricCard icon={UsersRound} label="Waiting now" value={String(waitingRows.length)} context={`${overdue} overdue`} accent="var(--color-primary)" />
        <MetricCard icon={Clock3} label="Average wait" value={formatMinutes(averageWait)} context="Current waiting patients" accent="var(--color-teal-solid)" />
        <MetricCard icon={Timer} label="Longest wait" value={formatMinutes(longestWait)} context={waitingRows[0]?.patient.name ?? waitingRows[0]?.patient.displayNumber ?? "No queue"} accent="var(--color-yellow-solid)" />
        <MetricCard icon={Activity} label="In treatment" value={String(inTreatment)} context={`${activeEncounters.length} active encounters`} accent="var(--color-green-solid)" />
        <MetricCard icon={BedDouble} label="Bed occupancy" value={`${occupancy}%`} context={`${beds.length - occupiedBeds} beds open`} accent={occupancy >= 85 ? "var(--color-red-solid)" : "var(--color-primary)"} />
        <MetricCard icon={Route} label="Disposition pending" value={String(pendingDisposition)} context="Admission, transfer, discharge" accent="var(--color-purple-ai)" />
      </div>

      <div className="grid grid-cols-[1.15fr_0.82fr_1fr] gap-2 max-[1080px]:grid-cols-2 max-[760px]:grid-cols-1">
        <section className="card min-w-0 px-2.5 py-2">
          <SectionHeader title="Arrival volume" detail="Last 8 hours" />
          <ArrivalChart buckets={arrivalBuckets} />
        </section>

        <section className="card px-2.5 py-2">
          <SectionHeader title="Triage mix" detail={`${activeEncounters.length} active`} />
          <div className="space-y-1.5">
            {triageCounts.map(({ level, count }) => {
              const palette = triagePalette(level);
              const percentage = activeEncounters.length ? (count / activeEncounters.length) * 100 : 0;
              return (
                <div key={level} className="grid grid-cols-[52px_1fr_24px] items-center gap-1.5">
                  <TriageBadge level={level} size="sm" />
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                    <div className="h-full rounded-full" style={{ width: `${percentage}%`, background: palette.solid }} />
                  </div>
                  <span className="text-right text-xs font-semibold">{count}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card px-2.5 py-2 max-[1080px]:col-span-2 max-[760px]:col-span-1">
          <SectionHeader title="Waiting longest" detail={`${waitingRows.length} waiting`} />
          {waitingRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-ink-secondary)]">No patients currently waiting.</p>
          ) : (
            <div className="space-y-0.5">
              {waitingRows.slice(0, 5).map((row, index) => (
                <button
                  key={row.encounter.id}
                  onClick={() => navigate(`/patients/${row.encounter.id}`)}
                  className="grid w-full grid-cols-[20px_60px_1fr_auto] items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-[var(--color-primary-tint)]"
                >
                  <span className="text-xs font-bold text-[var(--color-ink-secondary)]">{index + 1}</span>
                  <TriageBadge level={row.triage} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{row.patient.name ?? row.patient.displayNumber}</span>
                    <span className="block truncate text-xs text-[var(--color-ink-secondary)]">{row.encounter.chiefComplaint ?? row.encounter.currentLocationName ?? "No complaint"}</span>
                  </span>
                  <span className={isOverdue(row.triage, row.encounter.arrivedAt) ? "text-xs font-bold text-[var(--color-red-solid)]" : "text-xs font-semibold"}>
                    {formatMinutes(minutesSince(row.encounter.arrivedAt, now))}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(280px,0.7fr)] gap-2 max-[1050px]:grid-cols-1">
        <section className="card min-w-0 overflow-x-auto px-2.5 py-2">
          <SectionHeader title="Priority queue" detail={`${activeEncounters.length} active`} />
          <QueueTable rows={sorted} compact />
        </section>

        <div className="grid content-start gap-2 max-[1050px]:grid-cols-2 max-[680px]:grid-cols-1">
          <section className="card px-2.5 py-2">
            <SectionHeader title="Beds and zones" detail={`${occupancy}% occupied`} />
            <div className="space-y-1.5">
              {zones.map((zone) => {
                const zoneBeds = beds.filter((bed) => bed.zone === zone.id);
                const zoneOccupied = zoneBeds.filter((bed) => bed.encounterId).length;
                const percentage = zoneBeds.length ? (zoneOccupied / zoneBeds.length) * 100 : 0;
                const color = percentage >= 100 ? "var(--color-red-solid)" : percentage >= 70 ? "var(--color-yellow-solid)" : "var(--color-green-solid)";
                return (
                  <div key={zone.id}>
                    <div className="mb-0.5 flex justify-between text-xs">
                      <span className="font-semibold">{zone.name}</span>
                      <span className="text-[var(--color-ink-secondary)]">{zoneOccupied}/{zoneBeds.length}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                      <div className="h-full rounded-full" style={{ width: `${percentage}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card px-2.5 py-2">
            <SectionHeader title="Operational alerts" detail={`${alerts.length} active`} />
            {alerts.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-secondary)]">No active alerts.</p>
            ) : (
              <div className="space-y-1">
                {alerts.map((alert) => (
                  <div key={alert.id} className="flex items-start gap-2 text-sm">
                    <AlertCircle size={15} className="mt-0.5 shrink-0 text-[var(--color-yellow-solid)]" />
                    <span>{alert.newValue}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  context,
  accent,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  context: string;
  accent: string;
}) {
  return (
    <div className="card min-w-0 border-l-4 px-2.5 py-2" style={{ borderLeftColor: accent }}>
      <div className="mb-0.5 flex items-center gap-1.5 text-xs font-bold uppercase text-[var(--color-ink-secondary)]">
        <Icon size={14} /> {label}
      </div>
      <div className="truncate text-[24px] font-semibold leading-none" style={{ color: accent }}>{value}</div>
      <div className="mt-0.5 truncate text-xs text-[var(--color-ink-secondary)]" title={context}>{context}</div>
    </div>
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
  return (
    <div className="grid h-[112px] grid-cols-8 items-end gap-1.5" aria-label="Arrivals per hour">
      {buckets.map((bucket) => (
        <div key={bucket.label} className="flex h-full min-w-0 flex-col justify-end gap-1 text-center">
          <span className="text-xs font-semibold">{bucket.count}</span>
          <div className="mx-auto w-full max-w-10 rounded-t-sm bg-[var(--color-primary)] transition-[height]" style={{ height: `${Math.max(bucket.count ? 10 : 2, (bucket.count / max) * 70)}px`, opacity: bucket.count ? 1 : 0.25 }} />
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

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(interval);
  }, []);
  return now;
}
