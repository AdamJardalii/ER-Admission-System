import { loadPrototypeConfiguration } from "../prototypeConfiguration";

export class SimulatedRepositoryError extends Error {
  constructor(operation: string) {
    super(`Simulated prototype error while ${operation}. Retry the action or disable simulated errors in Prototype settings.`);
    this.name = "SimulatedRepositoryError";
  }
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function withPrototypeRepositoryBehavior<T>(operation: string, task: () => Promise<T>): Promise<T> {
  const configuration = loadPrototypeConfiguration();
  if (configuration.networkDelayMs > 0 && typeof window !== "undefined") {
    await wait(configuration.networkDelayMs);
  }
  if (
    import.meta.env.DEV &&
    configuration.simulateErrors &&
    Math.random() < configuration.simulatedErrorRate
  ) {
    throw new SimulatedRepositoryError(operation);
  }
  return task();
}
