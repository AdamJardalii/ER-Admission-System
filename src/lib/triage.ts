import type { TriageLevel, EsiLevel, StartColor } from "../types";

export function isEsi(level: TriageLevel): level is EsiLevel {
  return typeof level === "number";
}

export function isStartColor(level: TriageLevel): level is StartColor {
  return typeof level === "string";
}

interface TriagePalette {
  solid: string;
  tint: string;
  text: string;
  textOnSolid: string;
  label: string;
}

const ESI_PALETTE: Record<EsiLevel, TriagePalette> = {
  1: { solid: "var(--color-red-solid)", tint: "var(--color-red-tint)", text: "var(--color-red-text)", textOnSolid: "#FFFFFF", label: "ESI 1" },
  2: { solid: "var(--color-yellow-solid)", tint: "var(--color-yellow-tint)", text: "var(--color-yellow-text)", textOnSolid: "var(--color-yellow-text)", label: "ESI 2" },
  3: { solid: "var(--color-green-solid)", tint: "var(--color-green-tint)", text: "var(--color-green-text)", textOnSolid: "var(--color-green-text)", label: "ESI 3" },
  4: { solid: "var(--color-green-solid)", tint: "var(--color-green-tint)", text: "var(--color-green-text)", textOnSolid: "var(--color-green-text)", label: "ESI 4" },
  5: { solid: "var(--color-green-solid)", tint: "var(--color-green-tint)", text: "var(--color-green-text)", textOnSolid: "var(--color-green-text)", label: "ESI 5" },
};

const START_PALETTE: Record<StartColor, TriagePalette> = {
  red: { solid: "var(--color-red-solid)", tint: "var(--color-red-tint)", text: "var(--color-red-text)", textOnSolid: "#FFFFFF", label: "Red" },
  yellow: { solid: "var(--color-yellow-solid)", tint: "var(--color-yellow-tint)", text: "var(--color-yellow-text)", textOnSolid: "var(--color-yellow-text)", label: "Yellow" },
  green: { solid: "var(--color-green-solid)", tint: "var(--color-green-tint)", text: "var(--color-green-text)", textOnSolid: "var(--color-green-text)", label: "Green" },
  black: { solid: "var(--color-black-solid)", tint: "var(--color-black-solid)", text: "var(--color-black-text)", textOnSolid: "var(--color-black-text)", label: "Black" },
};

export function triagePalette(level: TriageLevel): TriagePalette {
  if (isEsi(level)) return ESI_PALETTE[level];
  return START_PALETTE[level];
}

export function esiRank(level: EsiLevel): number {
  return level;
}

export function startRank(level: StartColor): number {
  const order: Record<StartColor, number> = { red: 1, yellow: 2, green: 3, black: 4 };
  return order[level];
}

export function triageRank(level: TriageLevel | null): number {
  if (level === null) return 99;
  return isEsi(level) ? esiRank(level) : startRank(level);
}

export function formatWait(arrivedAt: number): string {
  const mins = Math.floor((Date.now() - arrivedAt) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export function waitMinutes(arrivedAt: number): number {
  return Math.floor((Date.now() - arrivedAt) / 60000);
}

const OVERDUE_THRESHOLD_MIN: Record<number, number> = {
  1: 0,
  2: 15,
  3: 30,
  4: 60,
  5: 120,
};

export function isOverdue(level: TriageLevel | null, arrivedAt: number): boolean {
  if (level === null || !isEsi(level)) return false;
  const threshold = OVERDUE_THRESHOLD_MIN[level] ?? 60;
  return waitMinutes(arrivedAt) > threshold;
}
