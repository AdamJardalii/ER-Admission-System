import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { triagePalette } from "../lib/triage";
import { patientPin } from "../lib/patientIdentity";
import type { StartColor } from "../types";

export function WristbandPreview({
  displayNumber,
  color,
  incidentCode,
  encounterId,
  onClose,
  autoDismissMs = 1500,
}: {
  displayNumber: string;
  color: StartColor;
  incidentCode: string | null;
  encounterId?: string;
  onClose: () => void;
  autoDismissMs?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [phase, setPhase] = useState<"printing" | "done">("printing");
  const [printFailed, setPrintFailed] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const pin = patientPin(`${displayNumber}:${encounterId ?? displayNumber}`);

  useEffect(() => {
    if (svgRef.current) {
      JsBarcode(svgRef.current, displayNumber.replace("#", ""), {
        format: "CODE128",
        width: 2,
        height: 40,
        displayValue: false,
        margin: 0,
      });
    }
  }, [displayNumber]);

  useEffect(() => {
    let cancelled = false;
    void import("qrcode").then((QRCode) =>
      QRCode.toDataURL(
        JSON.stringify({
          type: "er-wristband",
          displayNumber,
          encounterId,
          incidentCode,
          pin,
          triage: color,
        }),
        { margin: 1, width: 112 },
      ),
    ).then((url) => {
        if (!cancelled) setQrUrl(url);
      });
    return () => {
      cancelled = true;
    };
  }, [color, displayNumber, encounterId, incidentCode, pin]);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("done"), 500);
    const t2 = setTimeout(onClose, autoDismissMs);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDismissMs]);

  const palette = triagePalette(color);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[340px] rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="print-surface space-y-2 rounded-lg border border-[var(--color-border)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xl font-medium">{displayNumber}</div>
              <div className="font-mono text-sm font-semibold tracking-[0.16em] text-[var(--color-primary)]">
                PIN {pin}
              </div>
            </div>
            <div className="code-surface rounded p-1">
              {qrUrl && <img src={qrUrl} alt="Patient wristband QR" className="h-20 w-20" />}
            </div>
          </div>
          <svg ref={svgRef} className="w-full" />
          <div className="text-xs text-[var(--color-ink-secondary)]">
            {new Date().toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            {incidentCode ? ` | ${incidentCode}` : ""}
          </div>
          <div
            className="rounded px-2 py-1.5 text-center text-sm font-medium"
            style={{ background: palette.solid, color: palette.textOnSolid }}
          >
            {palette.label}
          </div>
        </div>

        <div className="mt-3 text-center text-sm text-[var(--color-ink-secondary)]">
          {phase === "printing" ? "Printing wristband..." : "Done - walk away"}
        </div>

        {!printFailed ? (
          <button
            className="mx-auto mt-2 block text-xs underline text-[var(--color-ink-secondary)]"
            onClick={(e) => {
              e.stopPropagation();
              setPrintFailed(true);
            }}
          >
            Print failed?
          </button>
        ) : (
          <div className="mt-2 text-center text-xs text-[var(--color-red-text)]">
            Write {displayNumber} on a backup band
          </div>
        )}
      </div>
    </div>
  );
}
