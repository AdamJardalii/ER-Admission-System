import { create } from "zustand";
import type { Mode } from "../types";

export type Theme = "light" | "dark";

export interface Toast {
  id: string;
  message: string;
  undo?: () => void;
}

interface AppState {
  mode: Mode;
  incidentId: string | null;
  incidentCode: string | null;
  theme: Theme;
  toasts: Toast[];
  bulkSessionCounts: Record<string, number>;
  setMode: (mode: Mode) => void;
  setIncident: (incidentId: string | null, incidentCode: string | null) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  pushToast: (message: string, undo?: () => void) => void;
  dismissToast: (id: string) => void;
  resetBulkSession: () => void;
  incrementBulk: (color: string) => void;
}

let toastCounter = 0;

function initialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("er-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const useAppStore = create<AppState>((set) => ({
  mode: "normal",
  incidentId: null,
  incidentCode: null,
  theme: initialTheme(),
  toasts: [],
  bulkSessionCounts: {},
  setMode: (mode) => set({ mode }),
  setIncident: (incidentId, incidentCode) => set({ incidentId, incidentCode }),
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
  pushToast: (message, undo) => {
    const id = `toast-${++toastCounter}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, undo }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  resetBulkSession: () => set({ bulkSessionCounts: {} }),
  incrementBulk: (color) =>
    set((s) => ({
      bulkSessionCounts: {
        ...s.bulkSessionCounts,
        [color]: (s.bulkSessionCounts[color] ?? 0) + 1,
      },
    })),
}));
