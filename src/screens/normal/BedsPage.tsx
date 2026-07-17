import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Activity, BedDouble, ClipboardList, FlaskConical, Signpost, X } from "lucide-react";
import { db } from "../../db/db";
import { useBeds, useZones, useAllActiveEncounters } from "../../db/hooks";
import { TriageBadge } from "../../components/TriageBadge";
import { QuickOrderDrawer } from "../../components/PatientQuickActions";
import { FloatingDropdown } from "../../components/FloatingDropdown";
import { assignLocation, clearEncounterLocation } from "../../db/repo";
import { useAppStore } from "../../store/useAppStore";
import type { EncounterView } from "../../db/hooks";
import type { Bed } from "../../types";

type BedMenu = { bedId: string; x: number; y: number } | null;
type QuickOrderType = "laboratory" | "imaging" | "medication" | "consultation" | "procedure";

export function BedsPage() {
  const beds = useBeds();
  const zones = useZones();
  const encounters = useAllActiveEncounters();
  const mode = useAppStore((s) => s.mode);
  const pushToast = useAppStore((s) => s.pushToast);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [assigningBedId, setAssigningBedId] = useState<string | null>(null);
  const [bedMenu, setBedMenu] = useState<BedMenu>(null);
  const [quickOrder, setQuickOrder] = useState<{ view: EncounterView; type: QuickOrderType } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const unassigned = useMemo(() => encounters.filter((e) => !e.encounter.currentLocationName), [encounters]);

  const byEncounter = new Map<string, EncounterView>();
  for (const e of encounters) byEncounter.set(e.encounter.id, e);

  const menuBed = bedMenu ? beds.find((b) => b.id === bedMenu.bedId) ?? null : null;
  const menuView = menuBed?.encounterId ? byEncounter.get(menuBed.encounterId) ?? null : null;

  const totalBeds = beds.length;
  const totalOccupied = beds.filter((b) => b.encounterId).length;
  const totalOpen = totalBeds - totalOccupied;

  useEffect(() => {
    const encounterId = searchParams.get("encounter");
    if (!encounterId) return;
    const currentBed = beds.find((bed) => bed.encounterId === encounterId);
    const openBed = beds.find((bed) => !bed.encounterId);
    setAssigningBedId(currentBed?.id ?? openBed?.id ?? null);
  }, [beds, searchParams]);

  useEffect(() => setBedMenu(null), [location.pathname]);

  useEffect(() => {
    if (!bedMenu) return undefined;
    const closeOnOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setBedMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBedMenu(null);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [bedMenu]);

  async function assign(bedId: string, bedName: string, zoneId: string, encounterId: string) {
    const priorBed = await db.beds.where("encounterId").equals(encounterId).first();
    if (priorBed && priorBed.id !== bedId) {
      await db.beds.update(priorBed.id, { encounterId: null });
    }
    await assignLocation(encounterId, bedName, zoneId, mode);
    await db.beds.update(bedId, { encounterId });
    setAssigningBedId(null);
    setBedMenu(null);
    pushToast(`Assigned to ${bedName}`);
  }

  async function vacateBed(bed: Bed) {
    if (!bed.encounterId) return;
    await clearEncounterLocation(bed.encounterId, mode);
    await db.beds.update(bed.id, { encounterId: null });
    setBedMenu(null);
    pushToast(`${bed.name} vacated`);
  }

  function openBedMenu(bedId: string, clientX: number, clientY: number) {
    const width = 270;
    const height = 330;
    setBedMenu({
      bedId,
      x: Math.max(8, Math.min(clientX, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(clientY, window.innerHeight - height - 8)),
    });
  }

  function menuKeyDown(event: React.KeyboardEvent<HTMLElement>, bedId: string) {
    if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      openBedMenu(bedId, rect.right - 8, rect.top + 18);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-2 px-3 py-2">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase text-[var(--color-primary)]">
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
            className="rounded-lg border border-[var(--color-border)] bg-white p-2 shadow-[0_4px_14px_rgba(23,32,51,0.05)]"
            style={{ borderLeft: `4px solid ${theme.accent}` }}
          >
            <div className="mb-2 flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase text-[var(--color-primary)]">
                  {theme.label}
                </p>
                <h2 className="text-[15px] font-semibold leading-tight">{zone.name}</h2>
              </div>
              <div className="text-right">
                <div className="text-base font-semibold leading-tight">{occupied} / {zoneBeds.length}</div>
                <div className="text-xs text-[var(--color-ink-secondary)]">
                  {available === 0 ? "Zone at capacity" : `${available} open`}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(112px,1fr))] gap-1.5">
              {zoneBeds.map((bed) => {
                const view = bed.encounterId ? byEncounter.get(bed.encounterId) : null;
                if (view) {
                  return (
                    <button
                      type="button"
                      key={bed.id}
                      className="group h-[76px] w-full overflow-hidden rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] p-2 text-left text-[var(--color-ink)] transition hover:-translate-y-0.5 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-tint)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      onClick={() => navigate(`/patients/${view.encounter.id}`)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        openBedMenu(bed.id, event.clientX, event.clientY);
                      }}
                      onKeyDown={(event) => menuKeyDown(event, bed.id)}
                      aria-label={`Open ${bed.name}, occupied by ${view.patient.name ?? view.patient.displayNumber}. Press Shift F10 for actions.`}
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="rounded bg-white px-1.5 py-0.5 text-xs font-bold text-[var(--color-ink-secondary)]">
                          {bed.name}
                        </span>
                        <TriageBadge level={view.triage} size="sm" />
                      </div>
                      <div className="truncate text-[13px] font-semibold leading-tight">
                        {view.patient.name ?? view.patient.displayNumber}
                      </div>
                      <div className="mt-1 truncate text-xs leading-tight text-[var(--color-ink-secondary)]">
                        {view.encounter.currentProvider ?? "Unassigned provider"}
                      </div>
                    </button>
                  );
                }
                return (
                  <AvailableBedCard
                    key={bed.id}
                    bed={bed}
                    assigning={assigningBedId === bed.id}
                    unassigned={unassigned}
                    onToggleAssign={() => setAssigningBedId(assigningBedId === bed.id ? null : bed.id)}
                    onOpenContextMenu={(event) => {
                      event.preventDefault();
                      openBedMenu(bed.id, event.clientX, event.clientY);
                    }}
                    onMenuKeyDown={(event) => menuKeyDown(event, bed.id)}
                    onAssign={(encounterId) => void assign(bed.id, bed.name, zone.id, encounterId)}
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      {bedMenu && menuBed && (
        <BedContextMenu
          refEl={menuRef}
          x={bedMenu.x}
          y={bedMenu.y}
          bed={menuBed}
          view={menuView}
          onAssign={() => {
            setAssigningBedId(menuBed.id);
            setBedMenu(null);
          }}
          onVacate={() => void vacateBed(menuBed)}
          onOpenChart={(encounterId) => navigate(`/patients/${encounterId}`)}
          onOpenTab={(encounterId, tab) => navigate(`/patients/${encounterId}?tab=${tab}`)}
          onOpenQueue={() => navigate("/queue?view=waiting")}
          onQuickOrder={(view, type) => {
            setQuickOrder({ view, type });
            setBedMenu(null);
          }}
        />
      )}

      {quickOrder && (
        <QuickOrderDrawer
          view={quickOrder.view}
          initialType={quickOrder.type}
          onClose={() => setQuickOrder(null)}
        />
      )}
    </div>
  );
}

function AvailableBedCard({
  bed,
  assigning,
  unassigned,
  onToggleAssign,
  onOpenContextMenu,
  onMenuKeyDown,
  onAssign,
}: {
  bed: Bed;
  assigning: boolean;
  unassigned: EncounterView[];
  onToggleAssign: () => void;
  onOpenContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMenuKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  onAssign: (encounterId: string) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={onToggleAssign}
        onContextMenu={onOpenContextMenu}
        onKeyDown={onMenuKeyDown}
        className="h-[76px] w-full overflow-hidden rounded-md border border-[var(--color-open-bed-border)] bg-[var(--color-green-tint)] p-2 text-left text-sm text-[var(--color-green-solid)] transition hover:border-[var(--color-green-solid)] hover:bg-[var(--color-open-bed-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-green-solid)]"
        aria-label={`Open ${bed.name}, available. Press Shift F10 for actions.`}
      >
        <div className="mb-1.5 inline-flex rounded bg-white px-1.5 py-0.5 text-xs font-bold">
          {bed.name}
        </div>
        <div className="text-[13px] font-semibold leading-tight">Available</div>
        <div className="mt-0.5 text-xs leading-tight text-[var(--color-green-text)]">Assign patient</div>
      </button>
      {assigning && (
        <AssignPatientMenu
          triggerRef={triggerRef}
          unassigned={unassigned}
          onAssign={onAssign}
        />
      )}
    </div>
  );
}

function AssignPatientMenu({
  triggerRef,
  unassigned,
  onAssign,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  unassigned: EncounterView[];
  onAssign: (encounterId: string) => void;
}) {
  return (
    <FloatingDropdown
      open
      triggerRef={triggerRef}
      minWidth={256}
      className="w-64 rounded-lg border border-[var(--color-border)] bg-white p-2 shadow-lg"
    >
      {unassigned.length === 0 ? (
        <div className="p-2 text-xs text-[var(--color-ink-secondary)]">
          No unassigned patients waiting.
        </div>
      ) : (
        unassigned.map((u) => (
          <button
            type="button"
            key={u.encounter.id}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--color-page)]"
            onClick={() => onAssign(u.encounter.id)}
          >
            <span>{u.patient.name ?? u.patient.displayNumber}</span>
            <TriageBadge level={u.triage} size="sm" />
          </button>
        ))
      )}
    </FloatingDropdown>
  );
}

function BedContextMenu({
  refEl,
  x,
  y,
  bed,
  view,
  onAssign,
  onVacate,
  onOpenChart,
  onOpenTab,
  onOpenQueue,
  onQuickOrder,
}: {
  refEl: React.RefObject<HTMLDivElement | null>;
  x: number;
  y: number;
  bed: Bed;
  view: EncounterView | null;
  onAssign: () => void;
  onVacate: () => void;
  onOpenChart: (encounterId: string) => void;
  onOpenTab: (encounterId: string, tab: string) => void;
  onOpenQueue: () => void;
  onQuickOrder: (view: EncounterView, type: QuickOrderType) => void;
}) {
  return (
    <div
      ref={refEl}
      role="menu"
      className="fixed z-[80] w-[270px] overflow-hidden rounded-md border border-[var(--color-border)] bg-white py-1 text-sm shadow-xl"
      style={{ left: x, top: y }}
      aria-label={view ? `Actions for ${bed.name}` : `Actions for available bed ${bed.name}`}
    >
      <div className="border-b border-[var(--color-border)] px-3 py-2">
        <div className="font-semibold">{bed.name}</div>
        {view ? (
          <div className="mt-1 flex items-center gap-2">
            <TriageBadge level={view.triage} size="sm" />
            <span className="truncate text-xs font-semibold">{view.patient.name ?? view.patient.displayNumber}</span>
          </div>
        ) : (
          <div className="text-xs font-semibold text-[var(--color-green-text)]">Available</div>
        )}
      </div>
      {!view ? (
        <>
          <MenuButton icon={<BedDouble size={15} />} onClick={onAssign}>Assign patient...</MenuButton>
          <MenuButton icon={<ClipboardList size={15} />} onClick={onOpenQueue}>View waiting queue</MenuButton>
        </>
      ) : (
        <>
          <MenuButton icon={<BedDouble size={15} />} onClick={() => onOpenChart(view.encounter.id)}>Open patient chart</MenuButton>
          <MenuButton icon={<Activity size={15} />} onClick={() => onOpenTab(view.encounter.id, "Vitals")}>Record vitals</MenuButton>
          <MenuDivider label="Orders" />
          <MenuButton icon={<FlaskConical size={15} />} onClick={() => onQuickOrder(view, "laboratory")}>New laboratory order</MenuButton>
          <MenuButton icon={<FlaskConical size={15} />} onClick={() => onQuickOrder(view, "imaging")}>New imaging order</MenuButton>
          <MenuButton icon={<ClipboardList size={15} />} onClick={() => onQuickOrder(view, "medication")}>Order medication</MenuButton>
          <MenuDivider label="Patient flow" />
          <MenuButton icon={<BedDouble size={15} />} onClick={onAssign}>Move patient...</MenuButton>
          <MenuButton icon={<Signpost size={15} />} onClick={() => onOpenTab(view.encounter.id, "Disposition")}>
            {view.encounter.disposition ? "Continue disposition" : "Start disposition"}
          </MenuButton>
          <MenuButton icon={<X size={15} />} danger onClick={onVacate}>Vacate bed</MenuButton>
        </>
      )}
    </div>
  );
}

function MenuDivider({ label }: { label: string }) {
  return <div className="border-t border-[var(--color-border)] px-3 py-1 text-[11px] font-bold uppercase text-[var(--color-ink-secondary)]">{label}</div>;
}

function MenuButton({ icon, children, danger, onClick }: { icon: React.ReactNode; children: React.ReactNode; danger?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-surface-muted)] focus:bg-[var(--color-primary-tint)] focus:outline-none ${
        danger ? "text-[var(--color-red-solid)]" : "text-[var(--color-ink)]"
      }`}
    >
      <span className={danger ? "text-[var(--color-red-solid)]" : "text-[var(--color-ink-secondary)]"}>{icon}</span>
      <span>{children}</span>
    </button>
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
