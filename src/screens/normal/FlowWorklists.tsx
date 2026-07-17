import { Link, useSearchParams } from "react-router-dom";
import { BedDouble, ClipboardList } from "lucide-react";
import { useAllActiveEncounters } from "../../db/hooks";
import { workflowStatusForEncounter } from "../../domain/encounterStateMachine";
import { DispositionWorkflow } from "./ClinicalWorkflow";

const ADMISSION_STATUSES = new Set(["ADMIT_REQUESTED", "ACCEPTANCE_PENDING", "BED_ASSIGNED"]);
const BOARDING_STATUSES = new Set(["BOARDING", "HANDOFF_PENDING"]);

export function FlowWorklist({ kind }: { kind: "admissions" | "boarding" }) {
  const encounters = useAllActiveEncounters();
  const [searchParams, setSearchParams] = useSearchParams();
  const statuses = kind === "admissions" ? ADMISSION_STATUSES : BOARDING_STATUSES;
  const rows = encounters.filter(({ encounter }) => statuses.has(workflowStatusForEncounter(encounter)));
  const selectedId = searchParams.get("encounter");
  const selected = rows.find(({ encounter }) => encounter.id === selectedId) ?? rows[0] ?? null;

  return (
    <main className="page-shell">
      <header className="compact-page-header">
        <div><h1>{kind === "admissions" ? "Admissions" : "Boarding"}</h1><p>{kind === "admissions" ? "Acceptance and inpatient bed requests." : "Patients waiting for inpatient transfer."}</p></div>
        <span className="rounded bg-[var(--color-yellow-tint)] px-2 py-1 text-xs font-semibold text-[var(--color-yellow-text)]">{rows.length} active</span>
      </header>
      <div className="grid gap-3 xl:grid-cols-[minmax(520px,1fr)_minmax(420px,0.9fr)]">
      <section className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center"><ClipboardList size={28} className="text-[var(--color-green-text)]" /><h2 className="text-base font-semibold">No active {kind}</h2><p className="text-sm text-[var(--color-ink-secondary)]">This worklist is clear.</p></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-[var(--color-border)] text-xs uppercase text-[var(--color-ink-secondary)]"><th className="px-3 py-2">Patient</th><th className="px-3 py-2">ESI</th><th className="px-3 py-2">Workflow</th><th className="px-3 py-2">Location</th><th className="px-3 py-2">Action</th></tr></thead><tbody>{rows.map(({ patient, encounter, triage }) => { const workflowStatus = workflowStatusForEncounter(encounter); return <tr key={encounter.id} className={`border-b border-[var(--color-border)] last:border-0 ${selected?.encounter.id === encounter.id ? "bg-[var(--color-primary-tint)]" : ""}`}><td className="px-3 py-3"><strong>{patient.name}</strong><span className="block text-xs text-[var(--color-ink-secondary)]">{patient.mrn ?? patient.displayNumber}</span></td><td className="px-3 py-3">{triage ? `ESI ${triage}` : "-"}</td><td className="px-3 py-3 capitalize">{workflowStatus.replace(/_/g, " ").toLowerCase()}</td><td className="px-3 py-3">{encounter.currentLocationName ?? "Unassigned"}</td><td className="px-3 py-3"><div className="flex items-center gap-3"><button type="button" onClick={() => setSearchParams({ encounter: encounter.id })} className="font-semibold text-[var(--color-primary)] hover:underline">Continue</button><Link to={`/patients/${encounter.id}?tab=Disposition`} className="font-semibold text-[var(--color-primary)] hover:underline">Open chart</Link></div></td></tr>; })}</tbody></table></div>
        )}
      </section>
      {selected && <section className="min-w-0"><p className="mb-2 flex items-center gap-1 text-xs font-semibold text-[var(--color-ink-secondary)]"><BedDouble size={14} />Continue the selected patient's flow</p><DispositionWorkflow encounterId={selected.encounter.id} /></section>}
      </div>
    </main>
  );
}
