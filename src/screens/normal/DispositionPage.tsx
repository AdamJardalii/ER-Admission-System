import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ClipboardCheck, UserRound } from "lucide-react";
import { useAllActiveEncounters } from "../../db/hooks";
import { DispositionWorkflow } from "./ClinicalWorkflow";

const PENDING_STATES = new Set([
  "disposition_pending",
  "admission_pending",
  "waiting_for_specialty_acceptance",
  "waiting_for_bed",
  "waiting_for_transport",
  "transfer_pending",
  "discharge_pending",
]);

export function DispositionPage() {
  const encounters = useAllActiveEncounters();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("encounter");
  const pending = useMemo(() => encounters.filter(({ encounter }) => PENDING_STATES.has(encounter.state)), [encounters]);
  const selected = pending.find(({ encounter }) => encounter.id === selectedId) ?? pending[0];

  if (!selected) {
    return (
      <main className="page-shell">
        <header className="compact-page-header"><div><h1>Disposition</h1><p>Admission, discharge, transfer, and departure worklist.</p></div></header>
        <section className="card flex min-h-48 flex-col items-center justify-center gap-2 text-center">
          <ClipboardCheck size={28} className="text-[var(--color-green-text)]" />
          <h2 className="text-base font-semibold">No patients are waiting for disposition</h2>
          <p className="text-sm text-[var(--color-ink-secondary)]">Disposition decisions will appear here when an encounter is ready.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <header className="compact-page-header"><div><h1>Disposition</h1><p>Move each encounter from decision through departure and closure.</p></div><span className="status-badge status-badge-warning">{pending.length} pending</span></header>
      <div className="grid gap-3 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.8fr)]">
        <section className="card min-w-0">
          <h2 className="mb-2 text-sm font-semibold">Worklist</h2>
          <div className="space-y-1" role="list" aria-label="Patients waiting for disposition">
            {pending.map(({ patient, encounter, triage }) => (
              <button key={encounter.id} type="button" onClick={() => setSearchParams({ encounter: encounter.id })} className={`flex min-h-14 w-full items-center gap-2 rounded-md border px-2.5 text-left ${selected.encounter.id === encounter.id ? "border-[var(--color-primary)] bg-[var(--color-primary-tint)]" : "border-[var(--color-border)] hover:bg-[var(--color-surface-muted)]"}`}>
                <UserRound size={16} className="shrink-0 text-[var(--color-ink-secondary)]" />
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{patient.name}</strong><span className="block truncate text-xs text-[var(--color-ink-secondary)]">{patient.mrn ?? patient.displayNumber} · {encounter.state.replace(/_/g, " ")}</span></span>
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: triage ? "var(--color-red-tint)" : "var(--color-surface-muted)" }}>{triage ? `ESI ${triage}` : "No ESI"}</span>
              </button>
            ))}
          </div>
          <Link to={`/patients/${selected.encounter.id}`} className="mt-3 inline-block text-xs font-semibold text-[var(--color-primary)] hover:underline">Open patient chart</Link>
        </section>
        <section className="min-w-0"><DispositionWorkflow encounterId={selected.encounter.id} /></section>
      </div>
    </main>
  );
}
