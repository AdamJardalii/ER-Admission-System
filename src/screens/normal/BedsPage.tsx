import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../db/db";
import { useBeds, useZones, useAllActiveEncounters } from "../../db/hooks";
import { TriageBadge } from "../../components/TriageBadge";
import { assignLocation } from "../../db/repo";
import { useAppStore } from "../../store/useAppStore";
import type { EncounterView } from "../../db/hooks";

export function BedsPage() {
  const beds = useBeds();
  const zones = useZones();
  const encounters = useAllActiveEncounters();
  const mode = useAppStore((s) => s.mode);
  const navigate = useNavigate();
  const [assigningBedId, setAssigningBedId] = useState<string | null>(null);

  const unassigned = encounters.filter((e) => !e.encounter.currentLocationName);

  const byEncounter = new Map<string, EncounterView>();
  for (const e of encounters) byEncounter.set(e.encounter.id, e);

  const totalBeds = beds.length;
  const totalOccupied = beds.filter((b) => b.encounterId).length;
  const totalOpen = totalBeds - totalOccupied;

  async function assign(bedId: string, bedName: string, zoneId: string, encounterId: string) {
    await assignLocation(encounterId, bedName, zoneId, mode);
    await db.beds.update(bedId, { encounterId });
    setAssigningBedId(null);
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-3 p-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-0.5 text-xs font-bold uppercase text-[var(--color-primary)]">
            Capacity board
          </p>
          <h1 className="text-lg font-semibold">Beds and zones</h1>
        </div>
        <div className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-ink-secondary)] shadow-sm ring-1 ring-[var(--color-border)]">
          {totalOpen} available of {totalBeds}
        </div>
      </div>

      {zones.map((zone) => {
        const zoneBeds = beds.filter((b) => b.zone === zone.id);
        const occupied = zoneBeds.filter((b) => b.encounterId).length;
        const available = zoneBeds.length - occupied;
        const theme = zoneTheme(zone.id, zone.name);
        return (
          <section
            key={zone.id}
            className="rounded-lg border border-[var(--color-border)] bg-white p-3 shadow-[0_4px_14px_rgba(23,32,51,0.05)]"
            style={{ borderLeft: `5px solid ${theme.accent}` }}
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <p className="mb-0.5 text-xs font-bold uppercase text-[var(--color-primary)]">
                  {theme.label}
                </p>
                <h2 className="text-base font-semibold">{zone.name}</h2>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold">{occupied} / {zoneBeds.length}</div>
                <div className="text-xs text-[var(--color-ink-secondary)]">
                  {available === 0 ? "Zone at capacity" : `${available} open`}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(118px,1fr))] gap-2">
              {zoneBeds.map((bed) => {
                const view = bed.encounterId ? byEncounter.get(bed.encounterId) : null;
                if (view) {
                  return (
                    <button
                      type="button"
                      key={bed.id}
                      className="group min-h-[92px] w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] p-2 text-left text-[var(--color-ink)] transition hover:-translate-y-0.5 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-tint)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      onClick={() => navigate(`/patients/${view.encounter.id}`)}
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <span className="rounded bg-white px-1.5 py-0.5 text-xs font-bold text-[var(--color-ink-secondary)]">
                          {bed.name}
                        </span>
                        <TriageBadge level={view.triage} size="sm" />
                      </div>
                      <div className="truncate text-sm font-semibold">
                        {view.patient.name ?? view.patient.displayNumber}
                      </div>
                      <div className="mt-1 truncate text-xs text-[var(--color-ink-secondary)]">
                        {view.encounter.currentProvider ?? "Unassigned provider"}
                      </div>
                      <div className="mt-2 inline-flex text-xs font-semibold text-[var(--color-primary)] opacity-0 transition group-hover:opacity-100">
                        View chart
                      </div>
                    </button>
                  );
                }
                return (
                  <div key={bed.id} className="relative">
                    <button
                      type="button"
                      onClick={() => setAssigningBedId(assigningBedId === bed.id ? null : bed.id)}
                      className="min-h-[92px] w-full rounded-md border border-[var(--color-open-bed-border)] bg-[var(--color-green-tint)] p-2 text-left text-sm text-[var(--color-green-solid)] transition hover:border-[var(--color-green-solid)] hover:bg-[var(--color-open-bed-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-green-solid)]"
                    >
                      <div className="mb-2 inline-flex rounded bg-white px-1.5 py-0.5 text-xs font-bold">
                        {bed.name}
                      </div>
                      <div className="text-sm font-semibold">Available</div>
                      <div className="mt-0.5 text-xs text-[var(--color-green-text)]">Assign patient</div>
                    </button>
                    {assigningBedId === bed.id && (
                      <div className="absolute left-0 top-full z-10 mt-1 max-h-64 w-64 overflow-auto rounded-lg border border-[var(--color-border)] bg-white p-2 shadow-lg">
                        {unassigned.length === 0 ? (
                          <div className="text-xs text-[var(--color-ink-secondary)] p-2">
                            No unassigned patients waiting.
                          </div>
                        ) : (
                          unassigned.map((u) => (
                            <button
                              type="button"
                              key={u.encounter.id}
                              className="flex items-center justify-between w-full text-left text-sm px-2 py-1.5 rounded hover:bg-[var(--color-page)]"
                              onClick={() => assign(bed.id, bed.name, zone.id, u.encounter.id)}
                            >
                              <span>{u.patient.name ?? u.patient.displayNumber}</span>
                              <TriageBadge level={u.triage} size="sm" />
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function zoneTheme(zoneId: string, zoneName: string): { accent: string; label: string } {
  const key = `${zoneId} ${zoneName}`.toLowerCase();
  if (key.includes("trauma")) return { accent: "var(--color-red-solid)", label: "Critical care" };
  if (key.includes("acute")) return { accent: "var(--color-yellow-solid)", label: "Main ER" };
  if (key.includes("fast")) return { accent: "var(--color-teal-solid)", label: "Low acuity" };
  if (key.includes("observation")) return { accent: "var(--color-purple-ai)", label: "Extended stay" };
  return { accent: "var(--color-primary)", label: "Treatment zone" };
}
