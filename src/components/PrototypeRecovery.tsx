import { useState } from "react";
import { AlertTriangle, Download, HeartPulse, RotateCcw, RotateCw } from "lucide-react";
import { exportPrototypeData, resetPrototypeData } from "../data/prototypePersistence";
import { ErrorState, LoadingState } from "./AsyncState";

export function PrototypeStartupState() {
  return (
    <div className="prototype-startup-shell" aria-busy="true">
      <div className="prototype-disclaimer-bar"><strong>Training prototype — not validated for clinical use.</strong></div>
      <div className="prototype-startup-nav"><HeartPulse size={20} />ER Command</div>
      <main>
        <LoadingState label="Opening saved ER Command data" />
        <div className="prototype-startup-skeleton" aria-hidden="true"><span /><span /><span /><span /></div>
      </main>
    </div>
  );
}

export function PrototypeRecovery({ error, retry }: { error: string; retry: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const execute = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    setActionError(null);
    try {
      await action();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Recovery could not be completed.");
    } finally {
      setBusy(null);
    }
  };

  const exportBackup = () =>
    execute("export", async () => {
      const json = await exportPrototypeData();
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `er-command-recovery-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    });

  const reset = () => {
    const confirmed = window.confirm(
      "Reset saved prototype data and restore the fictional seed set? Export a recovery backup first when possible.",
    );
    if (!confirmed) return;
    void execute("reset", async () => {
      await resetPrototypeData({ confirmed: true });
      await retry();
    });
  };

  return (
    <main className="prototype-recovery-page">
      <section aria-labelledby="prototype-recovery-title">
        <div className="prototype-recovery-heading">
          <AlertTriangle size={24} aria-hidden="true" />
          <div>
            <h1 id="prototype-recovery-title">Saved prototype data could not be opened</h1>
            <p>Training prototype — not validated for clinical use.</p>
          </div>
        </div>
        <ErrorState message={actionError ?? error} />
        <p className="prototype-recovery-copy">
          Retry first. You can export the current browser data for inspection, or reset only after confirming that the saved demo state may be replaced.
        </p>
        <div className="settings-actions">
          <button type="button" className="button button-secondary" disabled={busy !== null} onClick={() => void execute("retry", retry)}>
            <RotateCw size={16} />{busy === "retry" ? "Retrying…" : "Retry"}
          </button>
          <button type="button" className="button button-secondary" disabled={busy !== null} onClick={() => void exportBackup()}>
            <Download size={16} />{busy === "export" ? "Exporting…" : "Export recovery JSON"}
          </button>
          <button type="button" className="button button-danger" disabled={busy !== null} onClick={reset}>
            <RotateCcw size={16} />{busy === "reset" ? "Resetting…" : "Reset demo data"}
          </button>
        </div>
      </section>
    </main>
  );
}
