import { useNavigate } from "react-router-dom";
import { HeartPulse } from "lucide-react";
import { useAllActiveEncounters, useAllVitalsSets } from "../../db/hooks";
import { formatAgo, intervalForTriage, latestVitals, vitalsDueAt } from "../../lib/vitals";
import { TriageBadge } from "../../components/TriageBadge";

export function VitalsDuePage() {
  const rows = useAllActiveEncounters();
  const allVitals = useAllVitalsSets();
  const navigate = useNavigate();
  const now = Date.now();
  const dueRows = rows
    .map((row) => {
      const sets = allVitals.filter((vitals) => vitals.encounterId === row.encounter.id);
      const latest = latestVitals(sets);
      const dueAt = vitalsDueAt(latest?.recordedAt ?? null, row.triage);
      const schedule = intervalForTriage(row.triage);
      return { row, latest, dueAt, schedule, overdueBy: dueAt === null ? -Infinity : now - dueAt };
    })
    .filter((item) => item.dueAt !== null && item.dueAt <= now)
    .sort((a, b) => b.overdueBy - a.overdueBy);

  return (
    <div className="mx-auto max-w-[1280px] space-y-3 p-3">
      <div className="flex items-center gap-2">
        <HeartPulse size={20} className="text-[var(--color-primary)]" />
        <div>
          <h1 className="text-lg font-semibold">Vitals due</h1>
          <p className="text-xs text-[var(--color-ink-secondary)]">Most overdue patients first.</p>
        </div>
      </div>
      <section className="card overflow-x-auto">
        {dueRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-ink-secondary)]">No patients are overdue for repeat vitals.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left">
                <th className="px-2 py-1">Triage</th>
                <th className="px-2 py-1">Patient</th>
                <th className="px-2 py-1">Last vitals</th>
                <th className="px-2 py-1">Schedule</th>
                <th className="px-2 py-1">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {dueRows.map(({ row, latest, schedule, overdueBy }) => (
                <tr key={row.encounter.id} onClick={() => navigate(`/patients/${row.encounter.id}?tab=Vitals`)} className="cursor-pointer border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-primary-tint)]">
                  <td className="px-2 py-1"><TriageBadge level={row.triage} size="sm" /></td>
                  <td className="px-2 py-1">
                    <div className="font-semibold">{row.patient.name ?? row.patient.displayNumber}</div>
                    <div className="text-xs text-[var(--color-ink-secondary)]">{row.encounter.chiefComplaint ?? row.encounter.currentLocationName ?? "No complaint"}</div>
                  </td>
                  <td className="px-2 py-1">{latest ? `${formatAgo(latest.recordedAt)} | NEWS2 ${latest.news2}` : "No structured vitals"}</td>
                  <td className="px-2 py-1">{schedule?.label ?? "none"}</td>
                  <td className="px-2 py-1 font-bold text-[var(--color-red-solid)]">{formatDuration(overdueBy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function formatDuration(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
