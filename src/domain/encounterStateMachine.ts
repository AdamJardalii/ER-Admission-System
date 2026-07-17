import type { Disposition, Encounter, EncounterState, EncounterStatus } from "../types";

export const encounterTransitions: Record<EncounterStatus, readonly EncounterStatus[]> = {
  PRE_ARRIVAL: ["ARRIVED"],
  ARRIVED: ["TRIAGED", "ROOMED", "LWBS", "ELOPED", "DECEASED"],
  TRIAGED: ["WAITING", "ROOMED", "LWBS", "ELOPED", "DECEASED"],
  WAITING: ["ROOMED", "LWBS", "ELOPED", "AMA", "DECEASED"],
  ROOMED: ["IN_ASSESSMENT", "DECEASED"],
  IN_ASSESSMENT: ["AWAITING_RESULTS", "DISPOSITION_PENDING", "DECEASED"],
  AWAITING_RESULTS: ["IN_ASSESSMENT", "DISPOSITION_PENDING", "DECEASED"],
  DISPOSITION_PENDING: ["ADMIT_REQUESTED", "DISCHARGE_PENDING", "TRANSFER_PENDING", "AMA", "DECEASED"],
  ADMIT_REQUESTED: ["ACCEPTANCE_PENDING", "BED_ASSIGNED"],
  ACCEPTANCE_PENDING: ["BED_ASSIGNED", "DISPOSITION_PENDING"],
  BED_ASSIGNED: ["BOARDING"],
  BOARDING: ["HANDOFF_PENDING", "DEPARTED_ADMITTED"],
  DISCHARGE_PENDING: ["READY_FOR_DEPARTURE"],
  TRANSFER_PENDING: ["HANDOFF_PENDING", "READY_FOR_DEPARTURE"],
  HANDOFF_PENDING: ["READY_FOR_DEPARTURE", "DEPARTED_ADMITTED", "DEPARTED_TRANSFERRED"],
  READY_FOR_DEPARTURE: ["DEPARTED_DISCHARGED", "DEPARTED_TRANSFERRED"],
  DEPARTED_ADMITTED: [],
  DEPARTED_DISCHARGED: [],
  DEPARTED_TRANSFERRED: [],
  LWBS: [],
  AMA: [],
  ELOPED: [],
  DECEASED: [],
};

export const TERMINAL_ENCOUNTER_STATUSES: readonly EncounterStatus[] = [
  "DEPARTED_ADMITTED",
  "DEPARTED_DISCHARGED",
  "DEPARTED_TRANSFERRED",
  "LWBS",
  "AMA",
  "ELOPED",
  "DECEASED",
];

export interface DispositionWorkflowStep {
  value: string;
  label: string;
  toStatus?: EncounterStatus;
  closesEncounter?: boolean;
  requiresHandoff?: boolean;
}

export function initialStatusForDisposition(disposition: Disposition): EncounterStatus | null {
  if (["admitted", "icu", "ward", "operating_room"].includes(disposition)) return "ADMIT_REQUESTED";
  if (disposition === "transferred") return "TRANSFER_PENDING";
  if (disposition === "discharged") return "DISCHARGE_PENDING";
  if (disposition === "observation") return "IN_ASSESSMENT";
  if (disposition === "left_without_being_seen") return "LWBS";
  if (disposition === "left_against_medical_advice") return "AMA";
  if (disposition === "absconded") return "ELOPED";
  if (disposition === "deceased") return "DECEASED";
  return null;
}

export function dispositionWorkflowSteps(disposition: Disposition | null): DispositionWorkflowStep[] {
  if (["admitted", "icu", "ward", "operating_room"].includes(disposition ?? "")) {
    return [
      { value: "specialty_accepted", label: "Specialty accepted", toStatus: "ACCEPTANCE_PENDING" },
      { value: "bed_assigned", label: "Inpatient bed assigned", toStatus: "BED_ASSIGNED" },
      { value: "boarding_started", label: "Boarding started", toStatus: "BOARDING" },
      { value: "handoff_complete", label: "SBAR handoff complete", toStatus: "HANDOFF_PENDING", requiresHandoff: true },
      { value: "departed_er", label: "Departed ER", toStatus: "DEPARTED_ADMITTED", closesEncounter: true },
    ];
  }
  if (disposition === "transferred") {
    return [
      { value: "handoff_complete", label: "SBAR handoff complete", toStatus: "HANDOFF_PENDING", requiresHandoff: true },
      { value: "ready_for_departure", label: "Ready for departure", toStatus: "READY_FOR_DEPARTURE" },
      { value: "departed", label: "Patient departed", toStatus: "DEPARTED_TRANSFERRED", closesEncounter: true },
    ];
  }
  if (disposition === "discharged") {
    return [
      { value: "instructions_explained", label: "Instructions explained" },
      { value: "follow_up_arranged", label: "Follow-up arranged" },
      { value: "ready_for_departure", label: "Ready for departure", toStatus: "READY_FOR_DEPARTURE" },
      { value: "departed", label: "Patient departed", toStatus: "DEPARTED_DISCHARGED", closesEncounter: true },
    ];
  }
  if (disposition === "observation") {
    return [
      { value: "monitoring_started", label: "Monitoring started" },
      { value: "repeat_tests_due", label: "Repeat tests scheduled" },
      { value: "new_decision_required", label: "New decision required", toStatus: "DISPOSITION_PENDING" },
    ];
  }
  if (disposition === "unknown_status" || disposition === null) {
    return [{ value: "confirmed", label: "Outcome reviewed" }];
  }
  return [{ value: "confirmed", label: "Outcome confirmed", closesEncounter: true }];
}

export class InvalidEncounterTransitionError extends Error {
  constructor(from: EncounterStatus, to: EncounterStatus) {
    super(`Encounter cannot move from ${formatEncounterStatus(from)} to ${formatEncounterStatus(to)}.`);
    this.name = "InvalidEncounterTransitionError";
  }
}

export function canTransitionEncounter(from: EncounterStatus, to: EncounterStatus) {
  return encounterTransitions[from].includes(to);
}

export function assertEncounterTransition(from: EncounterStatus, to: EncounterStatus) {
  if (!canTransitionEncounter(from, to)) throw new InvalidEncounterTransitionError(from, to);
}

export function isTerminalEncounterStatus(status: EncounterStatus) {
  return TERMINAL_ENCOUNTER_STATUSES.includes(status);
}

export function workflowStatusForEncounter(encounter: Pick<Encounter, "state" | "workflowStatus" | "disposition">) {
  return encounter.workflowStatus ?? workflowStatusFromLegacy(encounter.state, encounter.disposition);
}

export function workflowStatusFromLegacy(state: EncounterState, disposition: Disposition | null = null): EncounterStatus {
  if (state === "triaged") return "TRIAGED";
  if (state === "waiting" || state === "fast_track") return "WAITING";
  if (state === "assigned" || state === "resuscitation") return "ROOMED";
  if (["in_assessment", "in_treatment", "reassessment_required", "observation"].includes(state)) return "IN_ASSESSMENT";
  if (state === "orders_pending") return "AWAITING_RESULTS";
  if (state === "disposition_pending" || state === "disposition_decided") return "DISPOSITION_PENDING";
  if (state === "admission_pending") return "ADMIT_REQUESTED";
  if (state === "waiting_for_specialty_acceptance") return "ACCEPTANCE_PENDING";
  if (state === "waiting_for_bed") return "BOARDING";
  if (state === "discharge_pending") return "DISCHARGE_PENDING";
  if (state === "transfer_pending" || state === "waiting_for_transport") return "TRANSFER_PENDING";
  if (state === "left_without_being_seen") return "LWBS";
  if (state === "left_against_medical_advice") return "AMA";
  if (state === "absconded") return "ELOPED";
  if (state === "deceased" || state === "died_before_treatment") return "DECEASED";
  if (state === "transferred" || state === "transferred_out") return "DEPARTED_TRANSFERRED";
  if (state === "discharged") return "DEPARTED_DISCHARGED";
  if (state === "closed") {
    if (["admitted", "icu", "ward", "operating_room"].includes(disposition ?? "")) return "DEPARTED_ADMITTED";
    if (disposition === "transferred") return "DEPARTED_TRANSFERRED";
    if (disposition === "deceased") return "DECEASED";
    return "DEPARTED_DISCHARGED";
  }
  return "ARRIVED";
}

export function legacyStateForWorkflowStatus(status: EncounterStatus): EncounterState {
  const map: Record<EncounterStatus, EncounterState> = {
    PRE_ARRIVAL: "arrived",
    ARRIVED: "arrived",
    TRIAGED: "triaged",
    WAITING: "waiting",
    ROOMED: "assigned",
    IN_ASSESSMENT: "in_assessment",
    AWAITING_RESULTS: "orders_pending",
    DISPOSITION_PENDING: "disposition_pending",
    ADMIT_REQUESTED: "admission_pending",
    ACCEPTANCE_PENDING: "waiting_for_specialty_acceptance",
    BED_ASSIGNED: "waiting_for_bed",
    BOARDING: "waiting_for_bed",
    DISCHARGE_PENDING: "discharge_pending",
    TRANSFER_PENDING: "transfer_pending",
    HANDOFF_PENDING: "disposition_pending",
    READY_FOR_DEPARTURE: "discharge_pending",
    DEPARTED_ADMITTED: "closed",
    DEPARTED_DISCHARGED: "discharged",
    DEPARTED_TRANSFERRED: "transferred_out",
    LWBS: "left_without_being_seen",
    AMA: "left_against_medical_advice",
    ELOPED: "absconded",
    DECEASED: "deceased",
  };
  return map[status];
}

export function formatEncounterStatus(status: EncounterStatus) {
  return status.toLowerCase().replace(/_/g, " ");
}
