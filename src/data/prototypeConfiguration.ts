export const PROTOTYPE_CONFIGURATION_VERSION = 1;
export const PROTOTYPE_CONFIGURATION_STORAGE_KEY = "er-prototype-configuration";

export interface PrototypeConfiguration {
  version: typeof PROTOTYPE_CONFIGURATION_VERSION;
  networkDelayMs: number;
  simulateErrors: boolean;
  simulatedErrorRate: number;
}

export const DEFAULT_PROTOTYPE_CONFIGURATION: PrototypeConfiguration = {
  version: PROTOTYPE_CONFIGURATION_VERSION,
  networkDelayMs: 120,
  simulateErrors: false,
  simulatedErrorRate: 0.05,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function migratePrototypeConfiguration(value: unknown): PrototypeConfiguration {
  if (!value || typeof value !== "object") return { ...DEFAULT_PROTOTYPE_CONFIGURATION };
  const candidate = value as Partial<PrototypeConfiguration>;
  return {
    version: PROTOTYPE_CONFIGURATION_VERSION,
    networkDelayMs: clamp(Number(candidate.networkDelayMs) || 0, 0, 1_000),
    simulateErrors: candidate.simulateErrors === true,
    simulatedErrorRate: clamp(Number(candidate.simulatedErrorRate) || 0, 0, 0.5),
  };
}

export function loadPrototypeConfiguration(): PrototypeConfiguration {
  if (typeof window === "undefined") return { ...DEFAULT_PROTOTYPE_CONFIGURATION };
  try {
    const stored = window.localStorage.getItem(PROTOTYPE_CONFIGURATION_STORAGE_KEY);
    return stored ? migratePrototypeConfiguration(JSON.parse(stored)) : { ...DEFAULT_PROTOTYPE_CONFIGURATION };
  } catch {
    return { ...DEFAULT_PROTOTYPE_CONFIGURATION };
  }
}

export function savePrototypeConfiguration(configuration: PrototypeConfiguration) {
  const next = migratePrototypeConfiguration(configuration);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PROTOTYPE_CONFIGURATION_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function resetPrototypeConfiguration() {
  return savePrototypeConfiguration({ ...DEFAULT_PROTOTYPE_CONFIGURATION });
}
