import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../db/db";
import { TriageBadge } from "../../components/TriageBadge";

export function ScanFind() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ encounterId: string; displayNumber: string; name: string | null }[]>([]);
  const [searched, setSearched] = useState(false);

  async function search() {
    setSearched(true);
    const term = query.trim().toUpperCase();
    if (!term) {
      setResults([]);
      return;
    }
    const patients = await db.patients
      .filter((p) => p.displayNumber.toUpperCase().includes(term) || (p.name ?? "").toUpperCase().includes(term))
      .toArray();
    const rows = [];
    for (const p of patients) {
      const encounter = await db.encounters.where("patientId").equals(p.id).first();
      if (encounter) {
        rows.push({ encounterId: encounter.id, displayNumber: p.displayNumber, name: p.name });
      }
    }
    setResults(rows);
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-[18px] font-medium">Scan or find tag</h1>

      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Tag number, e.g. B-2847"
          autoFocus
          className="flex-1 rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
        />
        <button
          onClick={search}
          className="rounded-xl px-5 py-3 text-sm font-medium text-white"
          style={{ background: "var(--color-primary)" }}
        >
          Find
        </button>
      </div>

      {searched && results.length === 0 && (
        <p className="text-sm text-[var(--color-ink-secondary)]">No matching patient found.</p>
      )}

      <div className="space-y-2">
        {results.map((r) => (
          <button
            key={r.encounterId}
            onClick={() => navigate(`/crisis/patient/${r.encounterId}`)}
            className="w-full text-left rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 flex items-center justify-between"
          >
            <span>
              <span className="font-medium">{r.name ?? "Unknown"}</span>{" "}
              <span className="text-[var(--color-ink-secondary)] text-sm">{r.displayNumber}</span>
            </span>
            <TriageBadgeForEncounter encounterId={r.encounterId} />
          </button>
        ))}
      </div>
    </div>
  );
}

function TriageBadgeForEncounter({ encounterId }: { encounterId: string }) {
  const [level, setLevel] = useState<number | string | null>(null);
  useEffect(() => {
    void db.triageAssessments
      .where("encounterId")
      .equals(encounterId)
      .sortBy("performedAt")
      .then((rows) => setLevel(rows[rows.length - 1]?.level ?? null));
  }, [encounterId]);
  return <TriageBadge level={level as never} size="sm" />;
}
