import { useNavigate } from "react-router-dom";
import { TriageBadge } from "./TriageBadge";
import { formatWait, isOverdue } from "../lib/triage";
import { useAllVitalsSets } from "../db/hooks";
import { latestVitals } from "../lib/vitals";
import type { EncounterView } from "../db/hooks";

const STATE_LABEL: Record<string, string> = {
  arrived: "Arrived",
  registered: "Registered",
  triaged: "Triaged",
  waiting: "Waiting",
  assigned: "Assigned",
  in_assessment: "In assessment",
  orders_pending: "Orders pending",
  in_treatment: "In treatment",
  reassessment_required: "Reassessment required",
  observation: "Observation",
  admission_pending: "Waiting for admission",
  waiting_for_specialty_acceptance: "Waiting for specialty",
  waiting_for_bed: "Waiting for bed",
  waiting_for_transport: "Waiting for transport",
  transfer_pending: "Transfer pending",
  discharge_pending: "Discharge pending",
  disposition_pending: "Disposition pending",
  disposition_decided: "Disposition decided",
  fast_track: "Fast-track",
  resuscitation: "Resuscitation",
  discharged: "Discharged",
  left_against_medical_advice: "Left against advice",
  transferred: "Transferred",
  deceased: "Deceased",
  identity_pending: "Identity pending",
  reconciliation_pending: "Reconciliation pending",
  unknown_status: "Unknown",
};

export function QueueTable({ rows, compact = false }: { rows: EncounterView[]; compact?: boolean }) {
  const navigate = useNavigate();
  const allVitals = useAllVitalsSets();
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
          const latest = latestVitals(allVitals.filter((vitals) => vitals.encounterId === row.encounter.id));
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
                <div className="flex items-center gap-1.5 font-medium">
                  {latest && latest.news2 >= 7 && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--color-red-solid)]" title={`NEWS2 ${latest.news2}`} />}
                  {row.patient.name ?? row.patient.displayNumber}
                </div>
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
