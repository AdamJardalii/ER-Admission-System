import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { db } from "../../db/db";
import { uuid } from "../../db/ids";
import { writeAudit } from "../../db/audit";
import { useAppStore } from "../../store/useAppStore";
import { useActiveIncident, useAllActiveEncounters, useZones, useReconciliationItems } from "../../db/hooks";
import { seedDemoIncident } from "../../db/seed";
import { isStartColor } from "../../lib/triage";

type ConfirmStep = "none" | "first" | "second";

export function IncidentCommand() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const setIncident = useAppStore((s) => s.setIncident);
  const activeIncident = useActiveIncident();
  const encounters = useAllActiveEncounters();
  const zones = useZones();
  const reconItems = useReconciliationItems();
  const navigate = useNavigate();

  const [activateStep, setActivateStep] = useState<ConfirmStep>("none");
  const [deactivateStep, setDeactivateStep] = useState<ConfirmStep>("none");
  const [showReconcilePrompt, setShowReconcilePrompt] = useState(false);
  const [seeding, setSeeding] = useState(false);

  async function activate() {
    const id = uuid();
    const code = `PORT-${String.fromCharCode(65 + Math.floor(Math.random() * 3))}`;
    await db.incidents.add({
      id,
      name: "Mass casualty incident",
      code,
      activatedAt: Date.now(),
      deactivatedAt: null,
    });
    await writeAudit({
      entityType: "incident",
      entityId: id,
      action: "activated",
      newValue: code,
      mode: "catastrophe",
    });
    setIncident(id, code);
    setMode("catastrophe");
    setActivateStep("none");
  }

  async function deactivate() {
    if (activeIncident) {
      await db.incidents.update(activeIncident.id, { deactivatedAt: Date.now() });
      await writeAudit({
        entityType: "incident",
        entityId: activeIncident.id,
        action: "deactivated",
        mode: "catastrophe",
      });
    }
    setMode("normal");
    setDeactivateStep("none");
    setShowReconcilePrompt(true);
  }

  async function loadDemoIncident() {
    setSeeding(true);
    const incidentId = await seedDemoIncident();
    const incident = await db.incidents.get(incidentId);
    if (incident) setIncident(incident.id, incident.code);
    setMode("catastrophe");
    setSeeding(false);
  }

  const pendingReconCount = reconItems.filter((r) => r.status === "pending").length;
  const colorCounts = { red: 0, yellow: 0, green: 0, black: 0 };
  for (const e of encounters) {
    if (e.triage !== null && isStartColor(e.triage)) {
      colorCounts[e.triage]++;
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-3 p-3">
      <h1 className="text-lg font-semibold">Incident command</h1>

      {mode === "normal" ? (
        <div className="card space-y-3">
          <div>
            <h2 className="mb-1 text-sm font-semibold">Activate catastrophe mode</h2>
            <p className="text-sm text-[var(--color-ink-secondary)]">
              Switches the system into mass-casualty triage mode. Requires two-person authorization.
            </p>
          </div>
          <button
            onClick={() => setActivateStep("first")}
            className="inline-flex w-fit items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white"
            style={{ background: "var(--color-catastrophe-bg)" }}
          >
            <AlertTriangle size={16} />
            Start catastrophe mode
          </button>

          <div className="border-t border-[var(--color-border)] pt-3">
            <button
              onClick={loadDemoIncident}
              disabled={seeding}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {seeding ? "Loading demo incident…" : "Load demo incident"}
            </button>
            <p className="text-xs text-[var(--color-ink-secondary)] mt-2">
              Seeds ~40 catastrophe patients with mixed triage colors and reconciliation items so the
              crisis flow demos well without manual setup.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="card">
            <h2 className="mb-2 text-sm font-semibold">Live zone counts</h2>
            <div className="grid grid-cols-4 gap-2">
              <ColorCount label="Red" count={colorCounts.red} bg="var(--color-red-solid)" fg="#fff" />
              <ColorCount label="Yellow" count={colorCounts.yellow} bg="var(--color-yellow-solid)" fg="var(--color-yellow-text)" />
              <ColorCount label="Green" count={colorCounts.green} bg="var(--color-green-solid)" fg="var(--color-green-text)" />
              <ColorCount label="Black" count={colorCounts.black} bg="var(--color-black-solid)" fg="var(--color-black-text)" />
            </div>
          </div>

          <div className="card">
            <h2 className="mb-2 text-sm font-semibold">Zones</h2>
            <div className="space-y-2">
              {zones.map((z) => (
                <div key={z.id} className="flex justify-between text-sm">
                  <span>{z.name}</span>
                  <span className="text-[var(--color-ink-secondary)]">
                    {encounters.filter((e) => e.encounter.currentZone === z.id).length} patients
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => setDeactivateStep("first")}
            className="rounded-md border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: "var(--color-catastrophe-bg)", color: "var(--color-catastrophe-bg)" }}
          >
            Deactivate catastrophe mode
          </button>
        </div>
      )}

      {activateStep !== "none" && (
        <ConfirmDialog
          title={activateStep === "first" ? "First authorization" : "Second authorization"}
          body="Requires two-person authorization to activate catastrophe mode."
          confirmLabel={activateStep === "first" ? "Confirm first authorization" : "Confirm second authorization"}
          onCancel={() => setActivateStep("none")}
          onConfirm={() => (activateStep === "first" ? setActivateStep("second") : activate())}
        />
      )}

      {deactivateStep !== "none" && (
        <ConfirmDialog
          title={deactivateStep === "first" ? "First authorization" : "Second authorization"}
          body="Requires two-person authorization to deactivate catastrophe mode."
          confirmLabel={deactivateStep === "first" ? "Confirm first authorization" : "Confirm second authorization"}
          onCancel={() => setDeactivateStep("none")}
          onConfirm={() => (deactivateStep === "first" ? setDeactivateStep("second") : deactivate())}
        />
      )}

      {showReconcilePrompt && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-5 w-[380px]">
            <h2 className="text-sm font-medium mb-2">
              {pendingReconCount} records incomplete
            </h2>
            <p className="text-sm text-[var(--color-ink-secondary)] mb-4">
              Open reconciliation to review and complete these records?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowReconcilePrompt(false)}
                className="rounded-lg px-3 py-1.5 text-sm border border-[var(--color-border)]"
              >
                Later
              </button>
              <button
                onClick={() => {
                  setShowReconcilePrompt(false);
                  navigate("/reconcile");
                }}
                className="rounded-lg px-3 py-1.5 text-sm text-white"
                style={{ background: "var(--color-primary)" }}
              >
                Open reconciliation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ColorCount({ label, count, bg, fg }: { label: string; count: number; bg: string; fg: string }) {
  return (
    <div className="rounded-lg p-2.5" style={{ background: bg, color: fg }}>
      <div className="text-xs opacity-90">{label}</div>
      <div className="text-xl font-semibold">{count}</div>
    </div>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-xl p-5 w-[380px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-medium mb-2">{title}</h2>
        <p className="text-sm text-[var(--color-ink-secondary)] mb-4">{body}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm border border-[var(--color-border)]">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: "var(--color-catastrophe-bg)" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
