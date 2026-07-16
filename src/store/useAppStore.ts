import { create } from "zustand";
import {
  loadPrototypeConfiguration,
  resetPrototypeConfiguration,
  savePrototypeConfiguration,
  type PrototypeConfiguration,
} from "../data/prototypeConfiguration";
import { loadDemoStaffId, saveDemoStaffId } from "../domain/prototypeUser";
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
  actingStaffId: string;
  prototypeConfiguration: PrototypeConfiguration;
  toasts: Toast[];
  bulkSessionCounts: Record<string, number>;
  setMode: (mode: Mode) => void;
  setIncident: (incidentId: string | null, incidentCode: string | null) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setActingStaff: (staffId: string) => void;
  updatePrototypeConfiguration: (updates: Partial<Omit<PrototypeConfiguration, "version">>) => void;
  restoreDefaultPrototypeConfiguration: () => void;
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
  actingStaffId: loadDemoStaffId(),
  prototypeConfiguration: loadPrototypeConfiguration(),
  toasts: [],
  bulkSessionCounts: {},
  setMode: (mode) => set({ mode }),
  setIncident: (incidentId, incidentCode) => set({ incidentId, incidentCode }),
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
  setActingStaff: (staffId) => set({ actingStaffId: saveDemoStaffId(staffId).id }),
  updatePrototypeConfiguration: (updates) =>
    set((state) => ({
      prototypeConfiguration: savePrototypeConfiguration({ ...state.prototypeConfiguration, ...updates }),
    })),
  restoreDefaultPrototypeConfiguration: () =>
    set({ prototypeConfiguration: resetPrototypeConfiguration() }),
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
