import { AlertTriangle, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { usePatientCount } from "../db/hooks";

export function CatastropheBanner() {
  const incidentCode = useAppStore((s) => s.incidentCode);
  const [syncState, setSyncState] = useState<"offline" | "syncing" | "synced">("offline");
  const patientCount = usePatientCount();

  useEffect(() => {
    const cycle = () => {
      setSyncState("syncing");
      setTimeout(() => setSyncState("synced"), 1800);
      setTimeout(() => setSyncState("offline"), 4200);
    };
    const interval = setInterval(cycle, 14000);
    return () => clearInterval(interval);
  }, []);

  const queued = Math.max(0, patientCount % 7);

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5"
      style={{ background: "var(--color-catastrophe-bg)", color: "var(--color-catastrophe-text)" }}
    >
      <AlertTriangle size={18} />
      <span className="font-medium text-[15px]">Catastrophe mode active</span>
      {incidentCode && (
        <span className="text-sm opacity-90">· Live counts · incident {incidentCode}</span>
      )}
      <span className="ml-auto flex items-center gap-1.5 text-xs opacity-90">
        <WifiOff size={14} />
        {syncState === "offline" && `Offline · ${queued} queued`}
        {syncState === "syncing" && "Syncing…"}
        {syncState === "synced" && "Synced"}
      </span>
    </div>
  );
}
