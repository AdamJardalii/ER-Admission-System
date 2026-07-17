import assert from "node:assert/strict";
import test from "node:test";
import {
  InvalidEncounterTransitionError,
  TERMINAL_ENCOUNTER_STATUSES,
  assertEncounterTransition,
  canTransitionEncounter,
  dispositionWorkflowSteps,
  encounterTransitions,
  initialStatusForDisposition,
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

test("admission disposition follows acceptance, bed, boarding, handoff, and departure", () => {
  assert.equal(initialStatusForDisposition("icu"), "ADMIT_REQUESTED");
  const steps = dispositionWorkflowSteps("icu");
  assert.deepEqual(steps.map((step) => step.toStatus), [
    "ACCEPTANCE_PENDING",
    "BED_ASSIGNED",
    "BOARDING",
    "HANDOFF_PENDING",
    "DEPARTED_ADMITTED",
  ]);
  const path = ["ADMIT_REQUESTED", ...steps.map((step) => step.toStatus)];
  for (let index = 1; index < path.length; index += 1) {
    assert.equal(canTransitionEncounter(path[index - 1], path[index]), true);
  }
  assert.equal(steps.find((step) => step.value === "handoff_complete")?.requiresHandoff, true);
  assert.equal(steps.at(-1)?.closesEncounter, true);
});

test("transfer requires handoff before departure", () => {
  assert.equal(initialStatusForDisposition("transferred"), "TRANSFER_PENDING");
  const steps = dispositionWorkflowSteps("transferred");
  assert.deepEqual(steps.map((step) => step.toStatus), [
    "HANDOFF_PENDING",
    "READY_FOR_DEPARTURE",
    "DEPARTED_TRANSFERRED",
  ]);
  assert.equal(steps[0].requiresHandoff, true);
});

test("discharge documents instructions and follow-up before closing", () => {
  assert.equal(initialStatusForDisposition("discharged"), "DISCHARGE_PENDING");
  const steps = dispositionWorkflowSteps("discharged");
  assert.deepEqual(steps.map((step) => step.value), [
    "instructions_explained",
    "follow_up_arranged",
    "ready_for_departure",
    "departed",
  ]);
  assert.equal(steps[2].toStatus, "READY_FOR_DEPARTURE");
  assert.equal(steps[3].toStatus, "DEPARTED_DISCHARGED");
  assert.equal(canTransitionEncounter(steps[2].toStatus, steps[3].toStatus), true);
});

test("unknown disposition remains open for review", () => {
  assert.equal(initialStatusForDisposition("unknown_status"), null);
  assert.equal(dispositionWorkflowSteps("unknown_status")[0].closesEncounter, undefined);
});
