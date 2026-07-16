import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { TriageBadge } from "./TriageBadge";
import { patientPin, patientQrPayload } from "../lib/patientIdentity";
import type { Encounter, Patient, TriageLevel } from "../types";

export function PatientIdentityModal({
  patient,
  encounter,
  triage,
  onClose,
}: {
  patient: Patient;
  encounter: Encounter;
  triage: TriageLevel | null;
  onClose: () => void;
}) {
  const [qrUrl, setQrUrl] = useState("");
  const pin = patientPin(`${patient.displayNumber}:${encounter.id}`);

  useEffect(() => {
    let cancelled = false;
    void import("qrcode").then((QRCode) =>
      QRCode.toDataURL(patientQrPayload({ patient, encounter, triage }), {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 180,
        color: {
          dark: "#111827",
          light: "#FFFFFF",
        },
      }),
    ).then((url) => {
        if (!cancelled) setQrUrl(url);
      });
    return () => {
      cancelled = true;
    };
  }, [patient, encounter, triage]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="w-full max-w-[360px] rounded-lg bg-[var(--color-surface)] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--color-primary)]">Patient identity</p>
            <h2 className="text-base font-semibold">{patient.name ?? "Unknown patient"}</h2>
            <p className="text-sm font-semibold text-[var(--color-primary)]">{patient.mrn ?? patient.displayNumber}</p>
            <p className="text-xs text-[var(--color-ink-secondary)]">Case {encounter.caseNumber ?? encounter.id.slice(0, 8)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] p-1.5 text-[var(--color-ink-secondary)]"
            aria-label="Close identity card"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-[180px_1fr] gap-3 max-[380px]:grid-cols-1">
          <div className="code-surface rounded-md border border-[var(--color-border)] p-2">
            {qrUrl ? (
              <img src={qrUrl} alt="Patient QR code" className="h-[164px] w-[164px]" />
            ) : (
              <div className="flex h-[164px] w-[164px] items-center justify-center text-xs text-[var(--color-ink-secondary)]">
                Generating QR
              </div>
            )}
          </div>

          <div className="space-y-2 text-sm">
            <div className="rounded-md bg-[var(--color-primary-tint)] p-2">
              <div className="text-xs font-bold uppercase text-[var(--color-ink-secondary)]">PIN</div>
              <div className="font-mono text-2xl font-bold tracking-[0.18em] text-[var(--color-primary)]">{pin}</div>
            </div>
            <InfoRow label="Location" value={encounter.currentLocationName ?? "Unassigned"} />
            <div>
              <div className="mb-1 text-xs font-bold uppercase text-[var(--color-ink-secondary)]">Triage</div>
              <TriageBadge level={triage} size="sm" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase text-[var(--color-ink-secondary)]">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
