import { useNavigate } from "react-router-dom";
import { ExternalLink, FileClock } from "lucide-react";
import { usePatientEncounters } from "../db/hooks";

export function PatientVisits({ patientId, currentEncounterId }: { patientId: string; currentEncounterId: string }) {
  const visits = usePatientEncounters(patientId);
  const navigate = useNavigate();

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileClock size={18} className="text-[var(--color-primary)]" />
          <div>
            <h2 className="text-base font-semibold">Visit and encounter history</h2>
            <p className="text-xs text-[var(--color-ink-secondary)]">Every ER visit remains linked to the same MRN.</p>
          </div>
        </div>
        <span className="rounded-md bg-[var(--color-surface-muted)] px-2.5 py-1 text-sm font-semibold">{visits.length} visits</span>
      </div>

      <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
        <table className="w-full min-w-[780px] border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-left">
              <th className="px-3 py-2">Case number</th>
              <th className="px-3 py-2">Arrival</th>
              <th className="px-3 py-2">Chief complaint</th>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Outcome</th>
              <th className="w-20 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visits.map((visit) => {
              const isCurrent = visit.id === currentEncounterId;
              return (
                <tr key={visit.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-primary-tint)]">
                  <td className="px-3 py-2 font-semibold">
                    {visit.caseNumber ?? visit.id.slice(0, 8)}
                    {isCurrent && <span className="ml-2 rounded bg-[var(--color-primary)] px-1.5 py-0.5 text-xs text-white">Current</span>}
                  </td>
                  <td className="px-3 py-2 text-[var(--color-ink-secondary)]">{new Date(visit.arrivedAt).toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="max-w-[300px] truncate px-3 py-2">{visit.chiefComplaint ?? "No complaint recorded"}</td>
                  <td className="px-3 py-2">{visit.currentProvider ?? "Unassigned"}</td>
                  <td className="px-3 py-2 capitalize">{(visit.disposition ?? visit.state).replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => navigate(`/patients/${visit.id}`)}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-sm font-semibold text-[var(--color-primary)]"
                    >
                      Open <ExternalLink size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
