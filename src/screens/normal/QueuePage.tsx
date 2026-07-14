import { useState } from "react";
import { useAllActiveEncounters } from "../../db/hooks";
import { sortQueue } from "../../lib/sortQueue";
import { QueueTable } from "../../components/QueueTable";
import { isEsi } from "../../lib/triage";

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

export function QueuePage() {
  const encounters = useAllActiveEncounters();
  const [esiFilter, setEsiFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  let filtered = encounters;
  if (esiFilter !== null) {
    filtered = filtered.filter((e) => e.triage !== null && isEsi(e.triage) && e.triage === esiFilter);
  }
  if (statusFilter !== null) {
    filtered = filtered.filter((e) => e.encounter.state === statusFilter);
  }

  const sorted = sortQueue(filtered);

  return (
    <div className="mx-auto max-w-[1440px] space-y-3 p-3">
      <h1 className="text-lg font-semibold">Patient queue</h1>

      <div className="flex flex-wrap gap-3 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 shadow-[0_4px_14px_rgba(23,32,51,0.04)]">
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase text-[var(--color-ink-secondary)]">ESI</span>
          <FilterChip active={esiFilter === null} onClick={() => setEsiFilter(null)}>
            All
          </FilterChip>
          {ESI_FILTERS.map((level) => (
            <FilterChip key={level} active={esiFilter === level} onClick={() => setEsiFilter(level)}>
              {level}
            </FilterChip>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase text-[var(--color-ink-secondary)]">Status</span>
          <FilterChip active={statusFilter === null} onClick={() => setStatusFilter(null)}>
            All
          </FilterChip>
          {STATUS_FILTERS.map((s) => (
            <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {s.replace(/_/g, " ")}
            </FilterChip>
          ))}
        </div>
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
