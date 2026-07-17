import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  BedDouble,
  ClipboardList,
  FileClock,
  FlaskConical,
  MoreVertical,
  Pill,
  Signpost,
  Stethoscope,
  TestTube2,
  UserRound,
} from "lucide-react";
import { addOrderRecord } from "../db/repo";
import { orderOptionsFor, FREQUENCY_OPTIONS, ROUTE_OPTIONS } from "../lib/clinicalCatalog";
import { useAppStore } from "../store/useAppStore";
import { DropdownSelect, FloatingDropdown } from "./FloatingDropdown";
import type { EncounterView } from "../db/hooks";
import type { OrderRecord, OrderType } from "../types";

type QuickOrderType = Extract<OrderType, "laboratory" | "imaging" | "medication" | "consultation" | "procedure">;

const QUICK_ORDER_TYPES: QuickOrderType[] = ["laboratory", "imaging", "medication", "consultation", "procedure"];
const TERMINAL_STATES = new Set([
  "closed",
  "discharged",
  "left_without_being_seen",
  "left_against_medical_advice",
  "transferred",
  "transferred_out",
  "absconded",
  "died_before_treatment",
  "deceased",
]);

export function PatientQuickActions({
  view,
  compact = false,
  label = "Quick actions",
  onAssignBed,
}: {
  view: EncounterView;
  compact?: boolean;
  label?: string;
  onAssignBed?: () => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [quickOrderType, setQuickOrderType] = useState<QuickOrderType | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuContentRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const patientLabel = view.patient.name ?? view.patient.displayNumber;
  const active = !TERMINAL_STATES.has(view.encounter.state);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !menuContentRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openTab(tab: string) {
    setOpen(false);
    navigate(`/patients/${view.encounter.id}?tab=${tab}`);
  }

  function openOrder(type: QuickOrderType) {
    setOpen(false);
    setQuickOrderType(type);
  }

  return (
    <>
      <div ref={menuRef} className="relative inline-flex">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Open actions for ${patientLabel}`}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((current) => !current);
          }}
          onKeyDown={(event) => {
            if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className={
            compact
              ? "inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-border)] bg-white text-[var(--color-ink-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              : "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-white px-2.5 text-xs font-semibold text-[var(--color-ink)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          }
        >
          {compact ? <MoreVertical size={16} /> : <><MoreVertical size={15} />{label}</>}
        </button>
        {open && (
          <FloatingDropdown
            open={open}
            triggerRef={triggerRef}
            contentRef={menuContentRef}
            align="end"
            minWidth={256}
            role="menu"
            aria-label={`Actions for ${patientLabel}`}
            className="w-64 overflow-hidden rounded-md border border-[var(--color-border)] bg-white py-1 text-sm shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <MenuGroup label="Open">
              <MenuItem icon={<UserRound size={15} />} onClick={() => openTab("Overview")}>Open patient chart</MenuItem>
              <MenuItem icon={<FileClock size={15} />} onClick={() => openTab("Timeline")}>Open encounter timeline</MenuItem>
            </MenuGroup>
            {active && (
              <>
                <MenuGroup label="Clinical">
                  <MenuItem icon={<Activity size={15} />} onClick={() => openTab("Vitals")}>Record vitals</MenuItem>
                  <MenuItem icon={<Stethoscope size={15} />} onClick={() => openTab("Assessment")}>Start assessment</MenuItem>
                  <MenuItem icon={<ClipboardList size={15} />} onClick={() => openTab("Care")}>Start reassessment</MenuItem>
                </MenuGroup>
                <MenuGroup label="Orders">
                  <MenuItem icon={<FlaskConical size={15} />} onClick={() => openOrder("laboratory")}>New laboratory order</MenuItem>
                  <MenuItem icon={<TestTube2 size={15} />} onClick={() => openOrder("imaging")}>New imaging order</MenuItem>
                  <MenuItem icon={<Pill size={15} />} onClick={() => openOrder("medication")}>Order medication</MenuItem>
                  <MenuItem icon={<ClipboardList size={15} />} onClick={() => openOrder("consultation")}>Request consultation</MenuItem>
                  <MenuItem icon={<Stethoscope size={15} />} onClick={() => openOrder("procedure")}>Request procedure</MenuItem>
                </MenuGroup>
                <MenuGroup label="Patient flow">
                  {onAssignBed && (
                    <MenuItem icon={<BedDouble size={15} />} onClick={() => { setOpen(false); onAssignBed(); }}>
                      {view.encounter.currentLocationName ? "Move bed" : "Assign bed"}
                    </MenuItem>
                  )}
                  <MenuItem icon={<Signpost size={15} />} onClick={() => openTab("Disposition")}>
                    {view.encounter.disposition ? "Continue disposition" : "Start disposition"}
                  </MenuItem>
                </MenuGroup>
              </>
            )}
            {!view.patient.registrationComplete && (
              <MenuGroup label="Other">
                <MenuItem icon={<UserRound size={15} />} onClick={() => openTab("Personal")}>Complete registration</MenuItem>
              </MenuGroup>
            )}
          </FloatingDropdown>
        )}
      </div>
      {quickOrderType && (
        <QuickOrderDrawer
          view={view}
          initialType={quickOrderType}
          onClose={() => setQuickOrderType(null)}
        />
      )}
    </>
  );
}

export function QuickOrderDrawer({
  view,
  initialType,
  onClose,
}: {
  view: EncounterView;
  initialType: QuickOrderType;
  onClose: () => void;
}) {
  const mode = useAppStore((state) => state.mode);
  const pushToast = useAppStore((state) => state.pushToast);
  const [orderType, setOrderType] = useState<QuickOrderType>(initialType);
  const [name, setName] = useState("");
  const [priority, setPriority] = useState<OrderRecord["priority"]>("routine");
  const [dose, setDose] = useState("");
  const [route, setRoute] = useState("IV");
  const [frequency, setFrequency] = useState("Once daily");
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const catalog = useMemo(() => orderOptionsFor(orderType), [orderType]);
  const patientLabel = view.patient.name ?? view.patient.displayNumber;

  useEffect(() => {
    setName("");
    setInstructions("");
  }, [orderType]);

  async function saveOrder() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const medDetails = orderType === "medication"
        ? [dose.trim(), route, frequency, instructions.trim()].filter(Boolean).join(" | ")
        : instructions.trim();
      await addOrderRecord({
        encounterId: view.encounter.id,
        patientId: view.patient.id,
        orderType,
        name: name.trim(),
        details: medDetails || null,
        priority,
        status: "ordered",
        actor: "Demo Provider",
        requestedDepartment: departmentFor(orderType),
        clinicalIndication: view.encounter.chiefComplaint ?? null,
        instructions: medDetails || null,
      }, mode);
      pushToast(`${orderType.replace(/_/g, " ")} order created`);
      onClose();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Order could not be created");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/20" role="dialog" aria-modal="true" aria-label="Quick order">
      <button type="button" aria-label="Close quick order" className="absolute inset-0 cursor-default" onClick={onClose} />
      <aside className="absolute bottom-0 right-0 top-[var(--app-header-height)] flex w-[min(420px,100vw)] flex-col border-l border-[var(--color-border)] bg-white shadow-xl max-[680px]:top-auto max-[680px]:max-h-[86vh] max-[680px]:w-full max-[680px]:rounded-t-lg">
        <div className="border-b border-[var(--color-border)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">New order</h2>
              <p className="mt-0.5 text-xs text-[var(--color-ink-secondary)]">
                {patientLabel} | {view.patient.mrn ?? view.patient.displayNumber} | {view.encounter.currentLocationName ?? "No bed"}
              </p>
              {view.encounter.allergies.length > 0 && (
                <p className="mt-1 text-xs font-semibold text-[var(--color-red-solid)]">
                  Allergies: {view.encounter.allergies.join(", ")}
                </p>
              )}
            </div>
            <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm font-semibold hover:bg-[var(--color-surface-muted)]">Close</button>
          </div>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          <div className="grid grid-cols-5 gap-1">
            {QUICK_ORDER_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setOrderType(type)}
                className={`min-h-9 rounded-md border px-1 text-[11px] font-semibold capitalize ${
                  orderType === type
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                    : "border-[var(--color-border)] bg-white text-[var(--color-ink-secondary)] hover:border-[var(--color-primary)]"
                }`}
              >
                {type === "consultation" ? "Consult" : type}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-secondary)]">
              {orderType === "medication" ? "Medication *" : "Order *"}
            </span>
            {catalog.length ? (
              <DropdownSelect
                value={name}
                options={catalog}
                placeholder={`Select ${orderType.replace(/_/g, " ")}`}
                onChange={setName}
                className="w-full rounded-md border border-[var(--color-border)] px-2 py-2 text-sm"
                ariaLabel={orderType === "medication" ? "Medication" : "Order"}
              />
            ) : (
              <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-md border border-[var(--color-border)] px-2 py-2 text-sm" />
            )}
          </label>
          {orderType === "medication" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-secondary)]">Dose</span>
                <input value={dose} onChange={(event) => setDose(event.target.value)} placeholder="e.g. 1 g" className="w-full rounded-md border border-[var(--color-border)] px-2 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-secondary)]">Route</span>
                <DropdownSelect
                  value={route}
                  options={ROUTE_OPTIONS}
                  onChange={setRoute}
                  className="w-full rounded-md border border-[var(--color-border)] px-2 py-2 text-sm"
                  ariaLabel="Route"
                />
              </label>
              <label className="col-span-2 block">
                <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-secondary)]">Frequency</span>
                <DropdownSelect
                  value={frequency}
                  options={FREQUENCY_OPTIONS}
                  onChange={setFrequency}
                  className="w-full rounded-md border border-[var(--color-border)] px-2 py-2 text-sm"
                  ariaLabel="Frequency"
                />
              </label>
            </div>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-secondary)]">Priority</span>
            <DropdownSelect
              value={priority}
              options={[
                { value: "routine", label: "Routine" },
                { value: "urgent", label: "Urgent" },
                { value: "stat", label: "STAT" },
              ]}
              onChange={(value) => setPriority(value as OrderRecord["priority"])}
              className="w-full rounded-md border border-[var(--color-border)] px-2 py-2 text-sm"
              ariaLabel="Priority"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-secondary)]">Instructions</span>
            <textarea rows={3} value={instructions} onChange={(event) => setInstructions(event.target.value)} className="w-full rounded-md border border-[var(--color-border)] px-2 py-2 text-sm" />
          </label>
          <p className="text-xs text-[var(--color-ink-secondary)]">
            Medication orders create an order request only. They are not marked as administered.
          </p>
        </div>
        <div className="border-t border-[var(--color-border)] p-3">
          <button
            type="button"
            disabled={!name.trim() || saving}
            onClick={() => void saveOrder()}
            className="w-full rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create order"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function MenuGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--color-border)] py-1 last:border-0">
      <div className="px-3 py-1 text-[11px] font-bold uppercase text-[var(--color-ink-secondary)]">{label}</div>
      {children}
    </div>
  );
}

function MenuItem({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      role="menuitem"
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface-muted)] focus:bg-[var(--color-primary-tint)] focus:outline-none"
    >
      <span className="text-[var(--color-ink-secondary)]">{icon}</span>
      <span>{children}</span>
    </button>
  );
}

function departmentFor(type: QuickOrderType) {
  if (type === "laboratory") return "Laboratory";
  if (type === "imaging") return "Radiology";
  if (type === "medication") return "Pharmacy / Nursing";
  if (type === "consultation") return "Consulting service";
  if (type === "procedure") return "Procedure team";
  return "Emergency Department";
}
