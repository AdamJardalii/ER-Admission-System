import type { OrderRecord, OrderStatus, ResultRecord, ResultReviewStatus, ResultStatus } from "../types";

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ["ordered", "cancelled"],
  ordered: ["acknowledged", "cancelled", "rejected", "patient_refused"],
  acknowledged: ["scheduled", "specimen_pending", "in_progress", "cancelled", "rejected", "patient_refused"],
  scheduled: ["specimen_pending", "in_progress", "cancelled", "patient_refused"],
  specimen_pending: ["specimen_collected", "cancelled", "rejected", "patient_refused"],
  specimen_collected: ["in_progress", "cancelled", "rejected", "failed"],
  in_progress: ["completed", "result_available", "cancelled", "failed", "patient_refused"],
  completed: ["result_available"],
  result_available: ["reviewed"],
  reviewed: [],
  cancelled: [],
  rejected: [],
  failed: [],
  patient_refused: [],
};

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  "reviewed",
  "cancelled",
  "rejected",
  "failed",
  "patient_refused",
];

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus) {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export function isOrderTerminal(status: OrderStatus) {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

export function isOrderOverdue(order: OrderRecord, now = Date.now()) {
  if (isOrderTerminal(order.status) || ["completed", "result_available"].includes(order.status)) return false;
  const elapsedMinutes = Math.max(0, (now - order.orderedAt) / 60_000);
  const threshold = order.priority === "stat" ? 15 : order.priority === "urgent" ? 60 : 180;
  return elapsedMinutes > threshold;
}

export function resultStatus(result: ResultRecord): ResultStatus {
  return result.status ?? "final";
}

export function resultReviewStatus(result: ResultRecord): ResultReviewStatus {
  return result.reviewStatus ?? "unreviewed";
}

export function criticalResultRequiresAcknowledgement(result: ResultRecord) {
  return result.flag === "critical" && resultReviewStatus(result) !== "acknowledged";
}

export function resultRequiresAttention(result: ResultRecord) {
  const review = resultReviewStatus(result);
  return review === "unreviewed" || review === "action_required" || criticalResultRequiresAcknowledgement(result);
}
