import { isEsi, triagePalette } from "../lib/triage";
import type { TriageLevel } from "../types";

export function TriageBadge({ level, size = "md" }: { level: TriageLevel | null; size?: "sm" | "md" }) {
  if (level === null) {
    return (
      <span
        className={`inline-flex items-center rounded-full border border-[var(--color-border)] text-[var(--color-ink-secondary)] ${
          size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-sm"
        }`}
      >
        Not triaged
      </span>
    );
  }
  const palette = triagePalette(level);
  const label = isEsi(level) ? `ESI ${level}` : palette.label;
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-sm"
      }`}
      style={{ background: palette.solid, color: palette.textOnSolid }}
    >
      {label}
    </span>
  );
}
