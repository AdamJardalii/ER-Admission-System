import { useCallback, useRef, useState, type ChangeEvent } from "react";
import {
  DatabaseBackup,
  Download,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { ErrorState, LoadingState } from "../../components/AsyncState";
import {
  exportPrototypeData,
  getPrototypeDataSummary,
  importPrototypeData,
  resetPrototypeData,
} from "../../data/prototypePersistence";
import { DEMO_STAFF, demoStaffById, defaultPathForDemoRole } from "../../domain/prototypeUser";
import { useAppStore } from "../../store/useAppStore";
import { useNavigate } from "react-router-dom";
import { useAsyncResource } from "../../lib/useAsyncResource";

export function PrototypeSettings() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const actingStaffId = useAppStore((state) => state.actingStaffId);
  const setActingStaff = useAppStore((state) => state.setActingStaff);
  const configuration = useAppStore((state) => state.prototypeConfiguration);
  const updateConfiguration = useAppStore((state) => state.updatePrototypeConfiguration);
  const restoreDefaults = useAppStore((state) => state.restoreDefaultPrototypeConfiguration);
  const pushToast = useAppStore((state) => state.pushToast);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const loadSummary = useCallback(() => getPrototypeDataSummary(), []);
  const summary = useAsyncResource(loadSummary);

  const runAction = async (name: string, action: () => Promise<void>) => {
    setBusyAction(name);
    setActionError(null);
    try {
      await action();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "The action could not be completed.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleRoleChange = (staffId: string) => {
    const selected = demoStaffById(staffId);
    setActingStaff(selected.id);
    pushToast(`Acting as ${selected.name}, ${selected.roleLabel}.`);
    navigate(defaultPathForDemoRole(selected.role));
  };

  const handleExport = () =>
    runAction("export", async () => {
      const json = await exportPrototypeData();
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `er-command-prototype-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      pushToast("Prototype backup exported.");
    });

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const confirmed = window.confirm(
      "Importing this backup will replace all saved prototype data in this browser. Export the current data first if you need it. Continue?",
    );
    if (!confirmed) return;
    await runAction("import", async () => {
      await importPrototypeData(await file.text(), { confirmed: true });
      window.location.reload();
    });
  };

  const handleReset = () => {
    const confirmed = window.confirm(
      "Reset all saved prototype data to the fictional seed set? This cannot be undone unless you exported a backup.",
    );
    if (!confirmed) return;
    void runAction("reset", async () => {
      await resetPrototypeData({ confirmed: true });
      window.location.reload();
    });
  };

  return (
    <main className="prototype-settings-page">
      <header className="compact-page-header">
        <div>
          <h1 className="flex items-center gap-2 text-xl"><Settings size={20} />Prototype settings</h1>
          <p>Local training configuration and browser data controls.</p>
        </div>
      </header>

      <div className="prototype-safety-notice" role="note">
        <ShieldAlert size={18} aria-hidden="true" />
        <div>
          <strong>Training prototype — not validated for clinical use.</strong>
          <p>Prototype configuration only. Values require clinical review before any real-world use.</p>
        </div>
      </div>

      {actionError && <ErrorState message={actionError} />}

      <section className="settings-band" aria-labelledby="role-settings-title">
        <div className="settings-band-heading">
          <h2 id="role-settings-title">Prototype user context</h2>
          <p>Prototype role simulation — no authentication is enabled.</p>
        </div>
        <label className="settings-field">
          <span>Acting as</span>
          <select value={actingStaffId} onChange={(event) => handleRoleChange(event.target.value)}>
            {DEMO_STAFF.map((staff) => (
              <option key={staff.id} value={staff.id}>{staff.name} — {staff.roleLabel}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="settings-band" aria-labelledby="simulation-settings-title">
        <div className="settings-band-heading">
          <h2 id="simulation-settings-title">Repository simulation</h2>
          <p>Applies to typed local repository calls in this development prototype.</p>
        </div>
        <div className="settings-grid">
          <label className="settings-field">
            <span>Simulated network delay <output>{configuration.networkDelayMs} ms</output></span>
            <input
              type="range"
              min="0"
              max="1000"
              step="25"
              value={configuration.networkDelayMs}
              onChange={(event) => updateConfiguration({ networkDelayMs: Number(event.target.value) })}
            />
          </label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={configuration.simulateErrors}
              onChange={(event) => updateConfiguration({ simulateErrors: event.target.checked })}
            />
            <span>
              <strong>Enable simulated errors</strong>
              <small>Development mode only</small>
            </span>
          </label>
          <label className="settings-field">
            <span>Error rate <output>{Math.round(configuration.simulatedErrorRate * 100)}%</output></span>
            <input
              type="range"
              min="0"
              max="0.5"
              step="0.01"
              value={configuration.simulatedErrorRate}
              disabled={!configuration.simulateErrors}
              onChange={(event) => updateConfiguration({ simulatedErrorRate: Number(event.target.value) })}
            />
          </label>
        </div>
        <button type="button" className="button button-secondary" onClick={() => { restoreDefaults(); pushToast("Prototype simulation defaults restored."); }}>
          <RefreshCw size={15} />Restore simulation defaults
        </button>
      </section>

      <section className="settings-band" aria-labelledby="data-settings-title">
        <div className="settings-band-heading">
          <h2 id="data-settings-title">Browser data</h2>
          <p>Versioned IndexedDB storage. Imports and resets always require confirmation.</p>
        </div>

        {summary.loading && !summary.data && <LoadingState label="Reading saved prototype data" />}
        {summary.error && <ErrorState message={summary.error} retry={summary.retry} />}
        {summary.data && (
          <dl className="prototype-data-summary">
            <div><dt>Patients</dt><dd>{summary.data.patients}</dd></div>
            <div><dt>Encounters</dt><dd>{summary.data.encounters}</dd></div>
            <div><dt>Audit events</dt><dd>{summary.data.auditEvents}</dd></div>
            <div><dt>Notifications</dt><dd>{summary.data.notifications}</dd></div>
          </dl>
        )}

        <div className="settings-actions">
          <button type="button" className="button button-secondary" onClick={() => void handleExport()} disabled={busyAction !== null}>
            <Download size={16} />{busyAction === "export" ? "Exporting…" : "Export JSON"}
          </button>
          <button type="button" className="button button-secondary" onClick={() => fileInputRef.current?.click()} disabled={busyAction !== null}>
            <Upload size={16} />{busyAction === "import" ? "Importing…" : "Import JSON"}
          </button>
          <button type="button" className="button button-danger" onClick={handleReset} disabled={busyAction !== null}>
            <RotateCcw size={16} />{busyAction === "reset" ? "Resetting…" : "Reset demo data"}
          </button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" className="sr-only" onChange={handleImport} />
        </div>
        <p className="settings-backup-note"><DatabaseBackup size={15} />Export a backup before reset or import when you need to preserve the current browser state.</p>
      </section>
    </main>
  );
}
