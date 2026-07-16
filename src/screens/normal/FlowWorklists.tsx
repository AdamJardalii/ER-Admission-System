import { Link, useSearchParams } from "react-router-dom";
import { BedDouble, ClipboardList } from "lucide-react";
import { useAllActiveEncounters } from "../../db/hooks";

const ADMISSION_STATES = new Set(["admission_pending", "waiting_for_specialty_acceptance", "waiting_for_bed"]);
const BOARDING_STATES = new Set(["waiting_for_bed", "disposition_pending"]);

export function FlowWorklist({ kind }: { kind: "admissions" | "boarding" }) {
  const encounters = useAllActiveEncounters();
  const [searchParams, setSearchParams] = useSearchParams();
  const states = kind === "admissions" ? ADMISSION_STATES : BOARDING_STATES;
  const rows = encounters.filter(({ encounter }) => states.has(encounter.state));
  const selectedId = searchParams.get("encounter");

  return (
    <main className="page-shell">
      <header className="compact-page-header">
        <div><h1>{kind === "admissions" ? "Admissions" : "Boarding"}</h1><p>{kind === "admissions" ? "Acceptance and inpatient bed requests." : "Patients waiting for inpatient transfer."}</p></div>
        <span className="rounded bg-[var(--color-yellow-tint)] px-2 py-1 text-xs font-semibold text-[var(--color-yellow-text)]">{rows.length} active</span>
      </header>
      <section className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center"><ClipboardList size={28} className="text-[var(--color-green-text)]" /><h2 className="text-base font-semibold">No active {kind}</h2><p className="text-sm text-[var(--color-ink-secondary)]">This worklist is clear.</p></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-[var(--color-border)] text-xs uppercase text-[var(--color-ink-secondary)]"><th className="px-3 py-2">Patient</th><th className="px-3 py-2">ESI</th><th className="px-3 py-2">Current state</th><th className="px-3 py-2">Location</th><th className="px-3 py-2">Action</th></tr></thead><tbody>{rows.map(({ patient, encounter, triage }) => <tr key={encounter.id} className={`border-b border-[var(--color-border)] last:border-0 ${selectedId === encounter.id ? "bg-[var(--color-primary-tint)]" : ""}`}><td className="px-3 py-3"><strong>{patient.name}</strong><span className="block text-xs text-[var(--color-ink-secondary)]">{patient.mrn ?? patient.displayNumber}</span></td><td className="px-3 py-3">{triage ? `ESI ${triage}` : "-"}</td><td className="px-3 py-3 capitalize">{encounter.state.replace(/_/g, " ")}</td><td className="px-3 py-3">{encounter.currentLocationName ?? "Unassigned"}</td><td className="px-3 py-3"><div className="flex items-center gap-3"><button type="button" onClick={() => setSearchParams({ encounter: encounter.id })} className="font-semibold text-[var(--color-primary)] hover:underline">Select</button><Link to={`/patients/${encounter.id}`} className="font-semibold text-[var(--color-primary)] hover:underline">Open chart</Link></div></td></tr>)}</tbody></table></div>
        )}
      </section>
      {selectedId && <p className="mt-2 flex items-center gap-1 text-xs text-[var(--color-ink-secondary)]"><BedDouble size={14} />Selected encounter is ready for the existing chart workflow.</p>}
    </main>
  );
}
