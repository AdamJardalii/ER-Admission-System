import assert from "node:assert/strict";
import test from "node:test";
import {
  InvalidEncounterTransitionError,
  TERMINAL_ENCOUNTER_STATUSES,
  assertEncounterTransition,
  canTransitionEncounter,
  encounterTransitions,
  isTerminalEncounterStatus,
  legacyStateForWorkflowStatus,
  workflowStatusFromLegacy,
} from "../src/domain/encounterStateMachine.ts";

test("normal encounter flow permits configured forward transitions", () => {
  const path = [
    "ARRIVED",
    "TRIAGED",
    "WAITING",
    "ROOMED",
    "IN_ASSESSMENT",
    "AWAITING_RESULTS",
    "DISPOSITION_PENDING",
    "DISCHARGE_PENDING",
    "READY_FOR_DEPARTURE",
    "DEPARTED_DISCHARGED",
  ];
  for (let index = 1; index < path.length; index += 1) {
    assert.equal(canTransitionEncounter(path[index - 1], path[index]), true);
  }
});

test("critical arrival can move directly from arrived to roomed", () => {
  assert.equal(canTransitionEncounter("ARRIVED", "ROOMED"), true);
});

test("invalid encounter transitions throw a clear domain error", () => {
  assert.equal(canTransitionEncounter("WAITING", "DEPARTED_DISCHARGED"), false);
  assert.throws(
    () => assertEncounterTransition("WAITING", "DEPARTED_DISCHARGED"),
    (error) => error instanceof InvalidEncounterTransitionError && /waiting.*departed discharged/i.test(error.message),
  );
});

test("terminal encounter states have no outgoing transitions", () => {
  for (const status of TERMINAL_ENCOUNTER_STATUSES) {
    assert.equal(isTerminalEncounterStatus(status), true);
    assert.deepEqual(encounterTransitions[status], []);
  }
});

test("legacy UI states map to canonical workflow states without changing old screens", () => {
  assert.equal(workflowStatusFromLegacy("registered"), "ARRIVED");
  assert.equal(workflowStatusFromLegacy("resuscitation"), "ROOMED");
  assert.equal(workflowStatusFromLegacy("closed", "admitted"), "DEPARTED_ADMITTED");
  assert.equal(legacyStateForWorkflowStatus("BED_ASSIGNED"), "waiting_for_bed");
});
