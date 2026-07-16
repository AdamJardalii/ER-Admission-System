import { useSearchParams } from "react-router-dom";
import { useAllActiveEncounters } from "../../db/hooks";
import { sortQueue } from "../../lib/sortQueue";
import { QueueTable } from "../../components/QueueTable";
import { isEsi, isOverdue } from "../../lib/triage";

const ESI_FILTERS = [1, 2, 3, 4, 5] as const;
const STATUS_FILTERS = [
  "arrived",
  "triaged",
  "waiting",
  "in_treatment",
  "observation",
  "admission_pending",
  "transfer_pending",
  "discharge_pending",
] as const;

const WAITING_STATES = ["arrived", "registered", "triaged", "waiting"];
const DISPOSITION_PENDING_STATES = [
  "disposition_pending",
  "admission_pending",
  "transfer_pending",
  "discharge_pending",
  "waiting_for_specialty_acceptance",
  "waiting_for_bed",
  "waiting_for_transport",
];

export function QueuePage() {
  const encounters = useAllActiveEncounters();
  const [searchParams, setSearchParams] = useSearchParams();
  const esiValue = Number(searchParams.get("esi"));
  const esiFilter = ESI_FILTERS.includes(esiValue as (typeof ESI_FILTERS)[number]) ? esiValue : null;
  const statusValue = searchParams.get("status");
  const statusFilter = statusValue && STATUS_FILTERS.includes(statusValue as (typeof STATUS_FILTERS)[number]) ? statusValue : null;
  const view = searchParams.get("view") ?? "all";
  const overdueOnly = searchParams.get("overdue") === "1";

  let filtered = encounters;
  if (esiFilter !== null) {
    filtered = filtered.filter((e) => e.triage !== null && isEsi(e.triage) && e.triage === esiFilter);
  }
  if (statusFilter !== null) {
    filtered = filtered.filter((e) => e.encounter.state === statusFilter);
  }
  if (view === "waiting") {
    filtered = filtered.filter((e) => WAITING_STATES.includes(e.encounter.state));
  }
  if (view === "disposition-pending") {
    filtered = filtered.filter((e) => DISPOSITION_PENDING_STATES.includes(e.encounter.state));
  }
  if (overdueOnly) {
    filtered = filtered.filter((e) => isOverdue(e.triage, e.encounter.arrivedAt));
  }

  const sorted = sortQueue(filtered);

  function setFilter(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-3 p-3">
      <h1 className="text-lg font-semibold">Patient queue</h1>

      <div className="flex flex-wrap gap-3 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 shadow-[0_4px_14px_rgba(23,32,51,0.04)]">
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase text-[var(--color-ink-secondary)]">ESI</span>
          <FilterChip active={esiFilter === null} onClick={() => setFilter("esi", null)}>
            All
          </FilterChip>
          {ESI_FILTERS.map((level) => (
            <FilterChip key={level} active={esiFilter === level} onClick={() => setFilter("esi", String(level))}>
              {level}
            </FilterChip>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase text-[var(--color-ink-secondary)]">Status</span>
          <FilterChip active={statusFilter === null} onClick={() => setFilter("status", null)}>
            All
          </FilterChip>
          {STATUS_FILTERS.map((s) => (
            <FilterChip key={s} active={statusFilter === s} onClick={() => setFilter("status", s)}>
              {s.replace(/_/g, " ")}
            </FilterChip>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase text-[var(--color-ink-secondary)]">Worklist</span>
          <FilterChip active={view === "all" && !overdueOnly} onClick={() => {
            const next = new URLSearchParams(searchParams);
            next.delete("view");
            next.delete("overdue");
            setSearchParams(next);
          }}>
            All
          </FilterChip>
          <FilterChip active={view === "waiting"} onClick={() => { setFilter("view", view === "waiting" ? null : "waiting"); }}>
            Waiting
          </FilterChip>
          <FilterChip active={view === "disposition-pending"} onClick={() => { setFilter("view", view === "disposition-pending" ? null : "disposition-pending"); }}>
            Disposition pending
          </FilterChip>
          <FilterChip active={overdueOnly} onClick={() => setFilter("overdue", overdueOnly ? null : "1")}>
            Overdue
          </FilterChip>
        </div>
        {searchParams.size > 0 && (
          <button type="button" onClick={() => setSearchParams({})} className="ml-auto text-xs font-semibold text-[var(--color-primary)] hover:underline">
            Clear filters
          </button>
        )}
      </div>

      <div className="card">
        <QueueTable rows={sorted} />
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
          : "border-[var(--color-border)] bg-white text-[var(--color-ink-secondary)] hover:border-[var(--color-primary)]"
      }`}
    >
      {children}
    </button>
  );
}
