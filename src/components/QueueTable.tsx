import { useNavigate } from "react-router-dom";
import { TriageBadge } from "./TriageBadge";
import { formatWait, isOverdue } from "../lib/triage";
import type { EncounterView } from "../db/hooks";

const STATE_LABEL: Record<string, string> = {
  arrived: "Arrived",
  registered: "Registered",
  triaged: "Triaged",
  waiting: "Waiting",
  in_treatment: "In treatment",
  observation: "Observation",
  admission_pending: "Waiting for admission",
  transfer_pending: "Transfer pending",
  discharge_pending: "Discharge pending",
  disposition_pending: "Disposition pending",
  unknown_status: "Unknown",
};

export function QueueTable({ rows, compact = false }: { rows: EncounterView[]; compact?: boolean }) {
  const navigate = useNavigate();
  const cellSpacing = compact ? "px-2 py-1" : "px-2 py-1.5";

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[var(--color-ink-secondary)]">
        No patients waiting - new arrivals appear here.
      </div>
    );
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-left">
          <th className={cellSpacing}>ESI</th>
          <th className={cellSpacing}>Patient</th>
          <th className={cellSpacing}>Wait</th>
          <th className={cellSpacing}>Location</th>
          <th className={cellSpacing}>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const overdue = isOverdue(row.triage, row.encounter.arrivedAt);
          return (
            <tr
              key={row.encounter.id}
              className="cursor-pointer border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-primary-tint)]"
              onClick={() => navigate(`/patients/${row.encounter.id}`)}
            >
              <td className={cellSpacing}>
                <TriageBadge level={row.triage} size="sm" />
              </td>
              <td className={cellSpacing}>
                <div className="font-medium">{row.patient.name ?? row.patient.displayNumber}</div>
                <div className="text-xs text-[var(--color-ink-secondary)]">
                  {row.patient.mrn ?? row.patient.displayNumber} | {row.encounter.caseNumber ?? row.encounter.id.slice(0, 8)}
                </div>
              </td>
              <td className={cellSpacing}>
                <span className={overdue ? "font-medium text-[var(--color-red-solid)]" : ""}>
                  {formatWait(row.encounter.arrivedAt)}
                  {overdue ? " | overdue" : ""}
                </span>
              </td>
              <td className={cellSpacing}>{row.encounter.currentLocationName ?? "Unassigned"}</td>
              <td className={cellSpacing}>{STATE_LABEL[row.encounter.state] ?? row.encounter.state}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
