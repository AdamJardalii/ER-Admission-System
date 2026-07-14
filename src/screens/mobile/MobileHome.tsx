import { useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { useAllActiveEncounters, useAlerts } from "../../db/hooks";
import { sortQueue } from "../../lib/sortQueue";
import { TriageBadge } from "../../components/TriageBadge";
import { formatWait } from "../../lib/triage";

export function MobileHome() {
  const encounters = useAllActiveEncounters();
  const alerts = useAlerts();
  const navigate = useNavigate();
  const sorted = sortQueue(encounters).filter((e) => e.encounter.currentProvider);

  return (
    <div className="mx-auto max-w-[480px] space-y-3 p-3">
      <h1 className="text-[18px] font-semibold">My patients</h1>

      {alerts.length > 0 && (
        <div className="space-y-1.5">
          {alerts.map((a) => (
            <div key={a.id} className="flex items-start gap-2 text-sm card">
              <AlertCircle size={16} className="text-[var(--color-yellow-solid)] shrink-0 mt-0.5" />
              <span>{a.newValue}</span>
            </div>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--color-ink-secondary)]">
          No patients assigned — new assignments appear here.
        </div>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((row) => (
            <button
              key={row.encounter.id}
              onClick={() => navigate(`/m/patients/${row.encounter.id}`)}
              className="card flex w-full items-center justify-between text-left"
            >
              <div>
                <div className="font-medium text-sm">{row.patient.name ?? row.patient.displayNumber}</div>
                <div className="text-xs text-[var(--color-ink-secondary)]">
                  {row.encounter.currentLocationName ?? "Unassigned"} · {formatWait(row.encounter.arrivedAt)}
                </div>
              </div>
              <TriageBadge level={row.triage} size="sm" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
