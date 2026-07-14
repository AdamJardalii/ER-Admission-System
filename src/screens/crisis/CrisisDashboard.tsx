import { useNavigate } from "react-router-dom";
import { Search, Users } from "lucide-react";
import { useAllActiveEncounters } from "../../db/hooks";
import { useAppStore } from "../../store/useAppStore";
import { createCatastrophePatient } from "../../db/repo";
import { isStartColor } from "../../lib/triage";
import type { StartColor } from "../../types";

const COLOR_META: { key: StartColor; label: string; bg: string; fg: string }[] = [
  { key: "red", label: "Red", bg: "var(--color-red-solid)", fg: "#fff" },
  { key: "yellow", label: "Yellow", bg: "var(--color-yellow-solid)", fg: "var(--color-yellow-text)" },
  { key: "green", label: "Green", bg: "var(--color-green-solid)", fg: "var(--color-green-text)" },
  { key: "black", label: "Black", bg: "var(--color-black-solid)", fg: "var(--color-black-text)" },
];

export function CrisisDashboard({ webEmbed = false }: { webEmbed?: boolean }) {
  const navigate = useNavigate();
  const incidentId = useAppStore((s) => s.incidentId);
  const pushToast = useAppStore((s) => s.pushToast);
  const encounters = useAllActiveEncounters();

  const counts: Record<StartColor, number> = { red: 0, yellow: 0, green: 0, black: 0 };
  for (const e of encounters) {
    if (e.triage !== null && isStartColor(e.triage)) counts[e.triage]++;
  }

  async function handleNewPatient() {
    const { patient, encounter } = await createCatastrophePatient(incidentId);
    pushToast(`Patient ${patient.displayNumber} saved on this device`);
    navigate(`/crisis/new/${encounter.id}`);
  }

  return (
    <div className={webEmbed ? "mx-auto max-w-[900px] space-y-3 p-3" : "space-y-3 p-3 pb-20"}>
      <div className="grid grid-cols-2 gap-2">
        {COLOR_META.map((c) => (
          <div
            key={c.key}
            className="rounded-lg p-3"
            style={{ background: c.bg, color: c.fg }}
          >
            <div className="text-sm opacity-90">{c.label}</div>
            <div className="text-[28px] font-semibold leading-tight">{counts[c.key]}</div>
          </div>
        ))}
      </div>

      <button
        onClick={handleNewPatient}
        className="w-full rounded-lg font-semibold text-white text-[17px]"
        style={{ background: "var(--color-primary)", minHeight: 68 }}
      >
        New patient
      </button>

      <button
        onClick={() => navigate("/crisis/scan")}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-white text-sm font-medium"
        style={{ minHeight: 56 }}
      >
        <Search size={18} />
        Scan or find tag
      </button>

      <button
        onClick={() => navigate("/crisis/bulk")}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] text-sm text-[var(--color-ink-secondary)]"
        style={{ minHeight: 48 }}
      >
        <Users size={16} />
        Bulk arrival
      </button>
    </div>
  );
}
