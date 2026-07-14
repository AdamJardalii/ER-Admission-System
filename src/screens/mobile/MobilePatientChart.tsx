import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useEncounterView, useClinicalEvents } from "../../db/hooks";
import { TriageBadge } from "../../components/TriageBadge";
import { updateEncounterField } from "../../db/repo";
import { useAppStore } from "../../store/useAppStore";

export function MobilePatientChart() {
  const { encounterId } = useParams<{ encounterId: string }>();
  const navigate = useNavigate();
  const view = useEncounterView(encounterId);
  const events = useClinicalEvents(encounterId);
  const mode = useAppStore((s) => s.mode);
  const [complaint, setComplaint] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setComplaint(view?.encounter.chiefComplaint ?? "");
  }, [view?.encounter.chiefComplaint]);

  useEffect(() => {
    if (!encounterId || !view || complaint === (view.encounter.chiefComplaint ?? "")) return undefined;
    setSaving(true);
    const timeout = window.setTimeout(() => {
      void updateEncounterField(encounterId, "chiefComplaint", complaint || null, mode).finally(() => setSaving(false));
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [complaint, encounterId, mode, view]);

  if (!view || !encounterId) {
    return <div className="p-4 text-sm text-[var(--color-ink-secondary)]">Loading…</div>;
  }

  const { patient, encounter, triage } = view;

  return (
    <div className="p-4 space-y-4 max-w-[480px] mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-[var(--color-ink-secondary)]">
        <ChevronLeft size={16} />
        Back
      </button>

      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium">{patient.name ?? patient.displayNumber}</span>
          <TriageBadge level={triage} size="sm" />
        </div>
        <div className="text-sm text-[var(--color-ink-secondary)]">
          {encounter.currentLocationName ?? "Unassigned"}
        </div>
      </div>

      <div className="card space-y-2">
        <div className="flex justify-between text-xs text-[var(--color-ink-secondary)]"><span>Chief complaint</span>{saving && <span>Saving</span>}</div>
        <textarea
          value={complaint}
          onChange={(event) => setComplaint(event.target.value)}
          rows={2}
          className="w-full text-sm border border-[var(--color-border)] rounded-lg p-2 outline-none resize-none"
        />
      </div>

      <div className="card">
        <div className="text-xs text-[var(--color-ink-secondary)] mb-2">Recent events</div>
        {events.length === 0 ? (
          <div className="text-sm text-[var(--color-ink-secondary)]">No events yet.</div>
        ) : (
          <div className="space-y-1.5">
            {events.slice(0, 8).map((e) => (
              <div key={e.id} className="flex justify-between text-sm">
                <span className="capitalize">{e.type.replace(/_/g, " ")}</span>
                <span className="text-[var(--color-ink-secondary)]">
                  {new Date(e.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
