import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useEncounterView } from "../../db/hooks";
import { setTriage } from "../../db/repo";
import { useAppStore } from "../../store/useAppStore";
import { WristbandPreview } from "../../components/WristbandPreview";
import type { StartColor } from "../../types";

const COLOR_BLOCKS: { key: StartColor; label: string; sub: string; bg: string; fg: string }[] = [
  { key: "red", label: "Red", sub: "Immediate", bg: "var(--color-red-solid)", fg: "#fff" },
  { key: "yellow", label: "Yellow", sub: "Delayed", bg: "var(--color-yellow-solid)", fg: "var(--color-yellow-text)" },
  { key: "green", label: "Green", sub: "Walking", bg: "var(--color-green-solid)", fg: "var(--color-green-text)" },
  { key: "black", label: "Black", sub: "Dead / expectant", bg: "var(--color-black-solid)", fg: "var(--color-black-text)" },
];

export function ColorPicker() {
  const { encounterId } = useParams<{ encounterId: string }>();
  const navigate = useNavigate();
  const view = useEncounterView(encounterId);
  const incidentCode = useAppStore((s) => s.incidentCode);
  const mode = useAppStore((s) => s.mode);
  const [confirmBlack, setConfirmBlack] = useState(false);
  const [preview, setPreview] = useState<StartColor | null>(null);

  if (!view || !encounterId) {
    return <div className="p-4 text-sm text-[var(--color-ink-secondary)]">Loading…</div>;
  }

  async function commit(color: StartColor) {
    await setTriage(encounterId!, "start", color, mode);
    setPreview(color);
  }

  function pick(color: StartColor) {
    if (color === "black") {
      setConfirmBlack(true);
      return;
    }
    void commit(color);
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-[18px] font-medium">
        Patient {view.patient.displayNumber} · tap color
      </h1>

      <div className="flex flex-col gap-3">
        {COLOR_BLOCKS.map((c) => (
          <button
            key={c.key}
            onClick={() => pick(c.key)}
            className="w-full rounded-xl font-medium text-[18px] flex flex-col items-center justify-center"
            style={{ background: c.bg, color: c.fg, minHeight: 72 }}
          >
            <span>{c.label}</span>
            <span className="text-sm font-normal opacity-90">{c.sub}</span>
          </button>
        ))}
      </div>

      {confirmBlack && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-5 w-[320px]">
            <h2 className="text-sm font-medium mb-2">Confirm expectant / deceased classification</h2>
            <p className="text-sm text-[var(--color-ink-secondary)] mb-4">
              This action marks the patient as black — expectant or deceased. This cannot be undone lightly.
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
                  void commit("black");
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

      {preview && (
        <WristbandPreview
          displayNumber={view.patient.displayNumber}
          color={preview}
          incidentCode={incidentCode}
          encounterId={encounterId}
          onClose={() => navigate("/")}
        />
      )}
    </div>
  );
}
