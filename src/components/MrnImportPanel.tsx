import { useState } from "react";
import { CheckCircle2, History, Search, UserRoundCheck, X } from "lucide-react";
import { db } from "../db/db";
import type { Encounter, Patient } from "../types";

export function MrnImportPanel({
  selectedPatientId,
  onImport,
  onClear,
}: {
  selectedPatientId: string | null;
  onImport: (patient: Patient, visits: Encounter[]) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [match, setMatch] = useState<{ patient: Patient; visits: Encounter[] } | null>(null);

  async function findPatient(value = query) {
    const term = value.trim().toUpperCase();
    if (!term) return;
    setSearching(true);
    setMessage("");
    const patient = await db.patients
      .filter((candidate) =>
        (candidate.mrn ?? "").toUpperCase() === term ||
        candidate.displayNumber.toUpperCase() === term,
      )
      .first();
    if (!patient) {
      setMatch(null);
      setMessage("No patient found with that MRN.");
      setSearching(false);
      return;
    }
    const visits = await db.encounters.where("patientId").equals(patient.id).toArray();
    visits.sort((a, b) => b.arrivedAt - a.arrivedAt);
    setMatch({ patient, visits });
    setSearching(false);
  }

  function tryMockMrn() {
    const value = "DEMO-MRN-001";
    setQuery(value);
    void findPatient(value);
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1">
          <div className="mb-1 flex items-center gap-2">
            <History size={16} className="text-[var(--color-primary)]" />
            <label htmlFor="mrn-search" className="text-sm font-semibold">Returning patient by MRN</label>
          </div>
          <div className="flex gap-2">
            <input
              id="mrn-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void findPatient();
                }
              }}
              placeholder="Enter MRN, for example MRN-100001"
              className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              disabled={searching || !query.trim()}
              onClick={() => void findPatient()}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Search size={16} /> {searching ? "Searching" : "Find"}
            </button>
          </div>
        </div>
        <button type="button" onClick={tryMockMrn} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-primary)]">
          Try mock MRN
        </button>
        {selectedPatientId && (
          <button type="button" onClick={onClear} className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
            <X size={15} /> Clear imported patient
          </button>
        )}
      </div>

      {message && <p className="mt-2 text-sm font-medium text-[var(--color-red-text)]">{message}</p>}

      {match && (
        <div className="mt-3 grid grid-cols-[minmax(220px,0.75fr)_minmax(0,1.5fr)] gap-3 border-t border-[var(--color-border)] pt-3 max-[850px]:grid-cols-1">
          <div className="min-w-0">
            <div className="mb-2 flex items-start gap-2">
              <UserRoundCheck size={20} className="mt-0.5 shrink-0 text-[var(--color-green-solid)]" />
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">{match.patient.name ?? "Unknown patient"}</div>
                <div className="text-sm font-semibold text-[var(--color-primary)]">{match.patient.mrn ?? match.patient.displayNumber}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <Info label="DOB" value={match.patient.dateOfBirth ?? "Unknown"} />
              <Info label="Sex" value={match.patient.sex ?? "Unknown"} />
              <Info label="Blood" value={match.patient.bloodGroup ?? "Unknown"} />
              <Info label="Visits" value={String(match.visits.length)} />
            </div>
            <button
              type="button"
              onClick={() => onImport(match.patient, match.visits)}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--color-green-solid)] px-3 py-2 text-sm font-semibold text-white"
            >
              {selectedPatientId === match.patient.id ? <CheckCircle2 size={16} /> : <UserRoundCheck size={16} />}
              {selectedPatientId === match.patient.id ? "Patient imported" : "Use this patient record"}
            </button>
          </div>

          <div className="min-w-0">
            <div className="mb-1.5 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Visit and encounter history</h2>
              <span className="text-xs text-[var(--color-ink-secondary)]">Newest first</span>
            </div>
            <div className="max-h-44 overflow-auto rounded-md border border-[var(--color-border)]">
              {match.visits.map((visit) => (
                <div key={visit.id} className="grid grid-cols-[130px_92px_1fr_120px] gap-2 border-b border-[var(--color-border)] px-2.5 py-2 text-sm last:border-0 max-[620px]:grid-cols-[110px_1fr]">
                  <strong>{visit.caseNumber ?? visit.id.slice(0, 8)}</strong>
                  <span className="text-[var(--color-ink-secondary)]">{new Date(visit.arrivedAt).toLocaleDateString()}</span>
                  <span className="truncate" title={visit.chiefComplaint ?? ""}>{visit.chiefComplaint ?? "No complaint recorded"}</span>
                  <span className="capitalize text-[var(--color-ink-secondary)]">{(visit.disposition ?? visit.state).replace(/_/g, " ")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><span className="text-xs font-semibold uppercase text-[var(--color-ink-secondary)]">{label}</span><div className="truncate font-medium">{value}</div></div>;
}
