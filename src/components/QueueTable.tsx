import { Link, useNavigate } from "react-router-dom";
import { TriageBadge } from "./TriageBadge";
import { PatientQuickActions } from "./PatientQuickActions";
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

export function QueueTable({ rows, compact = false, stickyHeader = false }: { rows: EncounterView[]; compact?: boolean; stickyHeader?: boolean }) {
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
      <thead className={stickyHeader ? "sticky top-0 z-10" : undefined}>
        <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-left">
          <th className={`${cellSpacing} w-[68px]`}>ESI</th>
          <th className={cellSpacing}>Patient</th>
          <th className={`${cellSpacing} w-[108px]`}>Wait</th>
          <th className={`${cellSpacing} w-[150px] max-[620px]:hidden`}>Location</th>
          <th className={`${cellSpacing} w-[170px] max-[520px]:hidden`}>Status</th>
          <th className={`${cellSpacing} w-[52px] text-right`}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const overdue = isOverdue(row.triage, row.encounter.arrivedAt);
          const latest = latestVitals(allVitals.filter((vitals) => vitals.encounterId === row.encounter.id));
          const patientLabel = row.patient.name ?? row.patient.displayNumber;
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
                <Link
                  to={`/patients/${row.encounter.id}`}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Open ${patientLabel}, ${STATE_LABEL[row.encounter.state] ?? row.encounter.state}`}
                  className="block min-w-0 rounded-sm"
                >
                  <span className="flex min-w-0 items-center gap-1.5 font-medium">
                    {latest && latest.news2 >= 7 && (
                      <>
                        <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[var(--color-red-solid)]" title={`NEWS2 ${latest.news2}`} />
                        <span className="sr-only">Critical NEWS2 {latest.news2}.</span>
                      </>
                    )}
                    <span className="truncate">{patientLabel}</span>
                  </span>
                  <span className="block truncate text-xs text-[var(--color-ink-secondary)] max-[520px]:hidden">
                    {row.patient.mrn ?? row.patient.displayNumber} | {row.encounter.caseNumber ?? row.encounter.id.slice(0, 8)}
                  </span>
                  <span className="hidden truncate text-xs text-[var(--color-ink-secondary)] max-[520px]:block">
                    {STATE_LABEL[row.encounter.state] ?? row.encounter.state}
                  </span>
                </Link>
              </td>
              <td className={cellSpacing}>
                <span className={overdue ? "font-medium text-[var(--color-red-solid)]" : ""}>
                  {formatWait(row.encounter.arrivedAt)}
                  {overdue ? " | overdue" : ""}
                </span>
              </td>
              <td className={`${cellSpacing} max-[620px]:hidden`}><span className="block truncate" title={row.encounter.currentLocationName ?? "Unassigned"}>{row.encounter.currentLocationName ?? "Unassigned"}</span></td>
              <td className={`${cellSpacing} max-[520px]:hidden`}><span className="block truncate" title={STATE_LABEL[row.encounter.state] ?? row.encounter.state}>{STATE_LABEL[row.encounter.state] ?? row.encounter.state}</span></td>
              <td className={`${cellSpacing} text-right`} onClick={(event) => event.stopPropagation()}>
                <PatientQuickActions view={row} compact onAssignBed={() => navigate(`/beds?encounter=${row.encounter.id}`)} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
