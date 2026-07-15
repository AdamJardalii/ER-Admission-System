import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Mic,
  Camera,
  Palette,
  MapPin,
  ClipboardList,
  UserPlus,
  MoreVertical,
  HeartPulse,
} from "lucide-react";
import { useEncounterView, useClinicalEvents, useVitalsSets } from "../../db/hooks";
import { addClinicalEvent, assignLocation, setDisposition, assignTeam, setTriage, recordTreatment } from "../../db/repo";
import { useAppStore } from "../../store/useAppStore";
import { WristbandPreview } from "../../components/WristbandPreview";
import { VoiceRecorderModal } from "../../components/VoiceRecorderModal";
import { PhotoCaptureModal } from "../../components/PhotoCaptureModal";
import { isStartColor, triagePalette } from "../../lib/triage";
import { CrisisNewsChip, VitalsCaptureForm } from "../../components/VitalsPanel";
import { latestVitals } from "../../lib/vitals";
import type { StartColor, Disposition } from "../../types";

type Overlay = "none" | "voice" | "photo" | "care" | "vitals" | "color" | "location" | "disposition" | "team" | "reprint";

const ZONES_STATIC = ["Triage A", "Triage B", "Triage C", "Trauma Bay 1", "Trauma Bay 2", "Fast-track"];
const PROVIDERS = ["Demo Provider", "Dr. Aoun", "Dr. Haddad", "Nurse Sarkis"];
const DISPOSITIONS: { value: Disposition; label: string }[] = [
  { value: "admitted", label: "Admitted" },
  { value: "discharged", label: "Discharged" },
  { value: "transferred", label: "Transferred" },
  { value: "deceased", label: "Deceased" },
  { value: "left_without_being_seen", label: "Left without being seen" },
];

export function CrisisPatientCard() {
  const { encounterId } = useParams<{ encounterId: string }>();
  const navigate = useNavigate();
  const view = useEncounterView(encounterId);
  const events = useClinicalEvents(encounterId);
  const vitalsSets = useVitalsSets(encounterId);
  const mode = useAppStore((s) => s.mode);
  const incidentCode = useAppStore((s) => s.incidentCode);
  const pushToast = useAppStore((s) => s.pushToast);

  const [overlay, setOverlay] = useState<Overlay>("none");
  const [confirmBlack, setConfirmBlack] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [wristbandColor, setWristbandColor] = useState<StartColor | null>(null);

  if (!view || !encounterId) {
    return <div className="p-4 text-sm text-[var(--color-ink-secondary)]">Loading…</div>;
  }

  const { patient, encounter, triage } = view;
  const palette = triage && isStartColor(triage) ? triagePalette(triage) : null;
  const latestStructuredVitals = latestVitals(vitalsSets);

  async function handleColorPick(color: StartColor) {
    if (color === "black") {
      setConfirmBlack(true);
      return;
    }
    const prevColor = triage;
    await setTriage(encounterId!, "start", color, mode);
    setOverlay("none");
    pushToast(`Color changed to ${color} — Undo`, async () => {
      if (prevColor && isStartColor(prevColor)) {
        await setTriage(encounterId!, "start", prevColor, mode);
      }
    });
  }

  async function handleLocation(loc: string) {
    await assignLocation(encounterId!, loc, "zone-trauma", mode);
    setOverlay("none");
    pushToast(`Location set to ${loc} — Undo`, async () => {
      await assignLocation(encounterId!, encounter.currentLocationName ?? "Unassigned", "zone-trauma", mode);
    });
  }

  async function handleDisposition(d: Disposition) {
    await setDisposition(encounterId!, d, mode);
    setOverlay("none");
    pushToast(`Disposition set — Undo`, async () => {
      await setDisposition(encounterId!, "left_without_being_seen", mode);
    });
  }

  async function handleTeam(provider: string) {
    await assignTeam(encounterId!, provider, mode);
    setOverlay("none");
    pushToast(`Team assigned: ${provider} — Undo`, async () => {
      await assignTeam(encounterId!, encounter.currentProvider ?? "", mode);
    });
  }

  const eventIcon: Record<string, string> = {
    voice_note: "Voice",
    photo: "Photo",
    re_triage: "Re-triage",
    created: "Created",
    location: "Location",
    disposition: "Disposition",
    team: "Team",
    treatment: "Care",
  };

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <div
          className="w-14 h-14 rounded shrink-0"
          style={{ background: palette?.solid ?? "var(--color-border)" }}
        />
        <div className="flex-1">
          <div className="text-sm text-[var(--color-ink-secondary)]">
            {palette?.label ?? "Unclassified"}
          </div>
          <div className="text-[18px] font-medium">
            {patient.name ?? `Unknown ${patient.displayNumber}`}
          </div>
          <div className="text-sm text-[var(--color-ink-secondary)]">
            {patient.estimatedAgeRange ?? "Age unknown"} · {encounter.currentLocationName ?? "No location"}
          </div>
          <div className="mt-1">
            <CrisisNewsChip latest={latestStructuredVitals} />
          </div>
        </div>
        <button
          onClick={() => setOverlay("photo")}
          className="w-11 h-11 rounded-full flex items-center justify-center border border-[var(--color-border)]"
        >
          <Camera size={18} />
        </button>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-11 h-11 rounded-full flex items-center justify-center border border-[var(--color-border)]"
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white card shadow-lg w-40 z-10">
              <button
                className="w-full text-left text-sm px-2 py-2 hover:bg-[var(--color-page)] rounded"
                onClick={() => {
                  setMenuOpen(false);
                  if (triage && isStartColor(triage)) setWristbandColor(triage);
                }}
              >
                Reprint band
              </button>
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium mb-2">Recent events</h2>
        {events.length === 0 ? (
          <div className="text-sm text-[var(--color-ink-secondary)]">
            No events yet — actions taken on this patient appear here.
          </div>
        ) : (
          <div className="space-y-1.5">
            {events.map((e) => (
              <div key={e.id} className="flex justify-between text-sm card py-2">
                <span>{eventIcon[e.type] ?? e.type}</span>
                <span className="text-[var(--color-ink-secondary)]">
                  {new Date(e.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {e.type === "voice_note" ? ` · ${(e.content as { durationSec?: number })?.durationSec ?? 0}s` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <ActionButton icon={<Mic size={22} />} label="Voice" onClick={() => setOverlay("voice")} />
        <ActionButton icon={<Camera size={22} />} label="Photo" onClick={() => setOverlay("photo")} />
        <ActionButton icon={<HeartPulse size={22} />} label="Care" onClick={() => setOverlay("care")} />
        <ActionButton icon={<HeartPulse size={22} />} label="Vitals" onClick={() => setOverlay("vitals")} />
        <ActionButton icon={<Palette size={22} />} label="Color" onClick={() => setOverlay("color")} />
        <ActionButton icon={<MapPin size={22} />} label="Location" onClick={() => setOverlay("location")} />
        <ActionButton icon={<ClipboardList size={22} />} label="Disposition" onClick={() => setOverlay("disposition")} />
        <ActionButton icon={<UserPlus size={22} />} label="Team" onClick={() => setOverlay("team")} />
      </div>

      <button
        onClick={() => navigate(-1)}
        className="w-full rounded-xl border border-[var(--color-border)] text-sm py-3"
      >
        Back
      </button>

      {overlay === "voice" && (
        <VoiceRecorderModal
          onClose={() => setOverlay("none")}
          onSave={async (durationSec, blob) => {
            await addClinicalEvent(encounterId!, "voice_note", { durationSec }, blob);
            setOverlay("none");
          }}
        />
      )}

      {overlay === "photo" && (
        <PhotoCaptureModal
          onClose={() => setOverlay("none")}
          onSave={async (blob) => {
            await addClinicalEvent(encounterId!, "photo", { placeholder: false }, blob);
            setOverlay("none");
          }}
        />
      )}

      {overlay === "care" && (
        <FullScreenSheet title="Record lifesaving action" onClose={() => setOverlay("none")}>
          <QuickCare
            provider={encounter.currentProvider ?? "Current clinician"}
            onSave={async (name, details, actor) => {
              await recordTreatment(encounterId, { name, details, actor, orderId: null }, mode);
              setOverlay("none");
              pushToast(`${name} recorded on this device`);
            }}
          />
        </FullScreenSheet>
      )}

      {overlay === "vitals" && (
        <FullScreenSheet title="Record crisis vitals" onClose={() => setOverlay("none")}>
          <VitalsCaptureForm encounterId={encounterId} source="crisis" compact onSaved={() => setOverlay("none")} />
        </FullScreenSheet>
      )}

      {overlay === "color" && (
        <FullScreenSheet title="Set color" onClose={() => setOverlay("none")}>
          <div className="flex flex-col gap-3">
            {(["red", "yellow", "green", "black"] as StartColor[]).map((c) => {
              const p = triagePalette(c);
              return (
                <button
                  key={c}
                  onClick={() => handleColorPick(c)}
                  className="rounded-xl font-medium text-[18px]"
                  style={{ background: p.solid, color: p.textOnSolid, minHeight: 72 }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </FullScreenSheet>
      )}

      {confirmBlack && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-5 w-[320px]">
            <h2 className="text-sm font-medium mb-2">Confirm expectant / deceased classification</h2>
            <p className="text-sm text-[var(--color-ink-secondary)] mb-4">
              This marks the patient as black — expectant or deceased.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmBlack(false)}
                className="rounded-lg px-3 py-2 text-sm border border-[var(--color-border)]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmBlack(false);
                  void handleColorPick("black");
                }}
                className="rounded-lg px-3 py-2 text-sm font-medium"
                style={{ background: "var(--color-black-solid)", color: "var(--color-black-text)" }}
              >
                Confirm black
              </button>
            </div>
          </div>
        </div>
      )}

      {overlay === "location" && (
        <FullScreenSheet title="Set location" onClose={() => setOverlay("none")}>
          <LocationPicker onPick={handleLocation} />
        </FullScreenSheet>
      )}

      {overlay === "disposition" && (
        <FullScreenSheet title="Set disposition" onClose={() => setOverlay("none")}>
          <div className="flex flex-col gap-2">
            {DISPOSITIONS.map((d) => (
              <button
                key={d.value}
                onClick={() => handleDisposition(d.value)}
                className="rounded-xl border border-[var(--color-border)] px-4 py-3 text-left text-sm"
              >
                {d.label}
              </button>
            ))}
          </div>
        </FullScreenSheet>
      )}

      {overlay === "team" && (
        <FullScreenSheet title="Assign team" onClose={() => setOverlay("none")}>
          <div className="flex flex-col gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p}
                onClick={() => handleTeam(p)}
                className="rounded-xl border border-[var(--color-border)] px-4 py-3 text-left text-sm"
              >
                {p}
              </button>
            ))}
          </div>
        </FullScreenSheet>
      )}

      {wristbandColor && (
        <WristbandPreview
          displayNumber={patient.displayNumber}
          color={wristbandColor}
          incidentCode={incidentCode}
          encounterId={encounter.id}
          onClose={() => setWristbandColor(null)}
        />
      )}
    </div>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-[var(--color-border)] bg-white flex flex-col items-center justify-center gap-1"
      style={{ minHeight: 72 }}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function FullScreenSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end z-50" onClick={onClose}>
      <div
        className="bg-[var(--color-page)] rounded-t-2xl p-4 w-full max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium">{title}</h2>
          <button onClick={onClose} className="text-sm text-[var(--color-ink-secondary)]">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LocationPicker({ onPick }: { onPick: (loc: string) => void }) {
  const [custom, setCustom] = useState("");
  return (
    <div className="flex flex-col gap-2">
      {ZONES_STATIC.map((z) => (
        <button
          key={z}
          onClick={() => onPick(z)}
          className="rounded-xl border border-[var(--color-border)] px-4 py-3 text-left text-sm bg-white"
        >
          {z}
        </button>
      ))}
      <div className="flex gap-2 mt-1">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Custom location"
          className="flex-1 rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm outline-none"
        />
        <button
          onClick={() => custom.trim() && onPick(custom.trim())}
          className="rounded-xl px-4 py-2.5 text-sm text-white"
          style={{ background: "var(--color-primary)" }}
        >
          Set
        </button>
      </div>
    </div>
  );
}

const QUICK_ACTIONS = ["Oxygen started", "IV access", "IV fluids started", "Tourniquet applied", "Blood started", "CPR started"];

function QuickCare({
  provider,
  onSave,
}: {
  provider: string;
  onSave: (name: string, details: string, actor: string) => void;
}) {
  const [name, setName] = useState("");
  const [details, setDetails] = useState("");
  const [actor, setActor] = useState(provider);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action}
            onClick={() => setName(action)}
            className={`min-h-12 rounded-lg border px-3 text-left text-sm font-semibold ${name === action ? "border-[var(--color-primary)] bg-[var(--color-primary-tint)] text-[var(--color-primary)]" : "border-[var(--color-border)] bg-white"}`}
          >
            {action}
          </button>
        ))}
      </div>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Other action" className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm outline-none" />
      <input value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Dose, rate, site, or brief detail" className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm outline-none" />
      <input value={actor} onChange={(event) => setActor(event.target.value)} placeholder="Provider" className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm outline-none" />
      <button disabled={!name.trim()} onClick={() => onSave(name.trim(), details.trim(), actor.trim() || "Unknown provider")} className="w-full rounded-lg bg-[var(--color-primary)] py-3 text-sm font-semibold text-white disabled:opacity-50">Save action now</button>
    </div>
  );
}
