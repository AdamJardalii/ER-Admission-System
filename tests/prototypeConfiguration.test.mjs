import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PROTOTYPE_CONFIGURATION,
  migratePrototypeConfiguration,
} from "../src/data/prototypeConfiguration.ts";

test("prototype configuration migration supplies safe defaults", () => {
  assert.deepEqual(migratePrototypeConfiguration(null), DEFAULT_PROTOTYPE_CONFIGURATION);
});

test("prototype configuration migration clamps unsafe simulation values", () => {
  const migrated = migratePrototypeConfiguration({
    version: 99,
    networkDelayMs: 9_000,
    simulateErrors: true,
    simulatedErrorRate: 4,
  });
  assert.equal(migrated.version, 1);
  assert.equal(migrated.networkDelayMs, 1_000);
  assert.equal(migrated.simulateErrors, true);
  assert.equal(migrated.simulatedErrorRate, 0.5);
});
