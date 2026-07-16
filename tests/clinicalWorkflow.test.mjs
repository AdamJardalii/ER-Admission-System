import assert from "node:assert/strict";
import test from "node:test";
import {
  ORDER_STATUS_TRANSITIONS,
  canTransitionOrderStatus,
  criticalResultRequiresAcknowledgement,
  isOrderOverdue,
  isOrderTerminal,
  resultRequiresAttention,
  resultReviewStatus,
  resultStatus,
} from "../src/lib/clinicalWorkflow.ts";

const baseOrder = {
  id: "order-test",
  encounterId: "encounter-test",
  patientId: "patient-test",
  orderType: "laboratory",
  name: "CBC",
  details: null,
  status: "ordered",
  actor: null,
};

test("order transitions permit only explicit workflow progress", () => {
  assert.equal(canTransitionOrderStatus("draft", "ordered"), true);
  assert.equal(canTransitionOrderStatus("ordered", "acknowledged"), true);
  assert.equal(canTransitionOrderStatus("ordered", "completed"), false);
  assert.equal(canTransitionOrderStatus("specimen_pending", "specimen_collected"), true);
  assert.equal(canTransitionOrderStatus("specimen_pending", "completed"), false);
  assert.equal(canTransitionOrderStatus("result_available", "reviewed"), true);
});

test("terminal orders cannot transition again", () => {
  for (const status of ["reviewed", "cancelled", "rejected", "failed", "patient_refused"]) {
    assert.equal(isOrderTerminal(status), true);
    assert.deepEqual(ORDER_STATUS_TRANSITIONS[status], []);
  }
});

test("overdue thresholds respect priority and completed work", () => {
  const now = Date.now();
  assert.equal(isOrderOverdue({ ...baseOrder, priority: "stat", orderedAt: now - 16 * 60_000 }, now), true);
  assert.equal(isOrderOverdue({ ...baseOrder, priority: "urgent", orderedAt: now - 59 * 60_000 }, now), false);
  assert.equal(isOrderOverdue({ ...baseOrder, priority: "routine", orderedAt: now - 181 * 60_000 }, now), true);
  assert.equal(isOrderOverdue({ ...baseOrder, priority: "stat", status: "completed", orderedAt: now - 999 * 60_000 }, now), false);
});

test("legacy result records receive safe workflow defaults", () => {
  assert.equal(resultStatus({ status: undefined }), "final");
  assert.equal(resultReviewStatus({ reviewStatus: undefined }), "unreviewed");
});

test("critical results remain visible until acknowledged", () => {
  const criticalReviewed = { flag: "critical", reviewStatus: "reviewed" };
  assert.equal(criticalResultRequiresAcknowledgement(criticalReviewed), true);
  assert.equal(resultRequiresAttention(criticalReviewed), true);
  assert.equal(criticalResultRequiresAcknowledgement({ flag: "critical", reviewStatus: "acknowledged" }), false);
  assert.equal(resultRequiresAttention({ flag: "normal", reviewStatus: "reviewed" }), false);
});
