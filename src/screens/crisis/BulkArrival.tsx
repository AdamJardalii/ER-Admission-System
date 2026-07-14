import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createCatastrophePatient, setTriage, assignLocation } from "../../db/repo";
import { useAppStore } from "../../store/useAppStore";
import { triagePalette } from "../../lib/triage";
import type { StartColor } from "../../types";

const COLORS: StartColor[] = ["red", "yellow", "green", "black"];
const ZONES_STATIC = ["Triage A", "Triage B", "Triage C", "Trauma Bay 1", "Trauma Bay 2", "Fast-track"];

export function BulkArrival() {
  const navigate = useNavigate();
  const incidentId = useAppStore((s) => s.incidentId);
  const mode = useAppStore((s) => s.mode);
  const [created, setCreated] = useState<{ id: string; color: StartColor }[]>([]);
  const [busy, setBusy] = useState(false);
  const [zoneAssigned, setZoneAssigned] = useState<string | null>(null);

  async function tap(color: StartColor) {
    if (busy) return;
    setBusy(true);
    const { encounter } = await createCatastrophePatient(incidentId);
    await setTriage(encounter.id, "start", color, mode);
    setCreated((c) => [...c, { id: encounter.id, color }]);
    setBusy(false);
  }

  async function assignZoneToBatch(zone: string) {
    for (const c of created) {
      await assignLocation(c.id, zone, "zone-trauma", mode);
    }
    setZoneAssigned(zone);
  }

  const counts: Record<StartColor, number> = { red: 0, yellow: 0, green: 0, black: 0 };
  for (const c of created) counts[c.color]++;

  return (
    <div className="p-4 space-y-4 pb-24">
      <h1 className="text-[18px] font-medium">Bulk arrival</h1>
      <p className="text-sm text-[var(--color-ink-secondary)]">
        Tap a color repeatedly to log arriving patients quickly.
      </p>

      <div className="rounded-xl bg-white border border-[var(--color-border)] p-3 text-center">
        <div className="text-2xl font-medium">+{created.length} created</div>
      </div>

      <div className="flex flex-col gap-3">
        {COLORS.map((c) => {
          const p = triagePalette(c);
          return (
            <button
              key={c}
              onClick={() => tap(c)}
              disabled={busy}
              className="rounded-xl font-medium text-[18px] flex items-center justify-between px-5"
              style={{ background: p.solid, color: p.textOnSolid, minHeight: 72 }}
            >
              <span>{p.label}</span>
              <span className="text-2xl tabular-nums">{counts[c]}</span>
            </button>
          );
        })}
      </div>

      {created.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Assign zone to batch</h2>
          <div className="grid grid-cols-2 gap-2">
            {ZONES_STATIC.map((z) => (
              <button
                key={z}
                onClick={() => assignZoneToBatch(z)}
                className={`rounded-lg border px-3 py-2.5 text-sm ${
                  zoneAssigned === z
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                    : "border-[var(--color-border)] bg-white"
                }`}
              >
                {z}
              </button>
            ))}
          </div>
          {zoneAssigned && (
            <p className="text-xs text-[var(--color-ink-secondary)]">
              {created.length} patients assigned to {zoneAssigned}.
            </p>
          )}
        </div>
      )}

      <button
        onClick={() => navigate("/")}
        className="w-full rounded-xl text-white text-sm font-medium py-3"
        style={{ background: "var(--color-primary)", minHeight: 72 }}
      >
        Done — back to command home
      </button>
    </div>
  );
}
