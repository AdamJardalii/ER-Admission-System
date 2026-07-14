import { db } from "./db";
import { uuid, nextCaseNumber, nextDisplayNumber, nextMrn } from "./ids";
import { writeAudit } from "./audit";
import type {
  Patient,
  Encounter,
  Mode,
  TriageLevel,
  TriageAlgorithm,
  ClinicalEventType,
  EncounterState,
  Disposition,
  OrderStatus,
  OrderType,
} from "../types";

export interface PatientWithEncounter {
  patient: Patient;
  encounter: Encounter;
  triage: TriageLevel | null;
}

// --- Catastrophe fast path -------------------------------------------------
// Creation is synchronous-feeling: patient + encounter only, nothing blocking.
export async function createCatastrophePatient(incidentId: string | null) {
  const now = Date.now();
  const displayNumber = nextDisplayNumber("catastrophe");
  const patientId = uuid();
  const encounterId = uuid();

  const patient: Patient = {
    id: patientId,
    displayNumber,
    mrn: null,
    name: null,
    dateOfBirth: null,
    sex: null,
    phone: null,
    photoBlob: null,
    identityStatus: "unknown",
    estimatedAgeRange: null,
    createdAt: now,
  };

  const encounter: Encounter = {
    id: encounterId,
    caseNumber: displayNumber,
    patientId,
    incidentId,
    modeAtCreation: "catastrophe",
    arrivedAt: now,
    state: "arrived",
    disposition: null,
    closedAt: null,
    chiefComplaint: null,
    allergies: [],
    currentLocationName: null,
    currentZone: null,
    currentProvider: null,
  };

  await db.patients.add(patient);
  await db.encounters.add(encounter);
  await db.clinicalEvents.add({
    id: uuid(),
    encounterId,
    type: "created",
    content: { displayNumber, mode: "catastrophe" },
    attachmentBlob: null,
    recordedAt: now,
  });
  await writeAudit({
    entityType: "encounter",
    entityId: encounterId,
    action: "created",
    newValue: displayNumber,
    mode: "catastrophe",
  });

  return { patient, encounter };
}

export async function createCriticalPatient() {
  const now = Date.now();
  const displayNumber = nextDisplayNumber("normal");
  const mrn = nextMrn();
  const caseNumber = nextCaseNumber();
  const patientId = uuid();
  const encounterId = uuid();
  const patient: Patient = {
    id: patientId,
    displayNumber,
    mrn,
    name: null,
    dateOfBirth: null,
    sex: "unknown",
    phone: null,
    photoBlob: null,
    identityStatus: "provisional",
    estimatedAgeRange: null,
    createdAt: now,
  };
  const encounter: Encounter = {
    id: encounterId,
    caseNumber,
    patientId,
    incidentId: null,
    modeAtCreation: "normal",
    arrivedAt: now,
    state: "in_treatment",
    disposition: null,
    closedAt: null,
    chiefComplaint: "Critical patient - immediate treatment",
    allergies: [],
    currentLocationName: "Resuscitation",
    currentZone: "zone-trauma",
    currentProvider: null,
  };
  await db.transaction("rw", db.patients, db.encounters, db.clinicalEvents, async () => {
    await db.patients.add(patient);
    await db.encounters.add(encounter);
    await db.clinicalEvents.add({
      id: uuid(),
      encounterId,
      type: "created",
      content: { displayNumber, mode: "normal", criticalFastPath: true },
      attachmentBlob: null,
      recordedAt: now,
    });
  });
  await setTriage(encounterId, "esi", 1, "normal", "Immediate danger - registration deferred");
  await db.encounters.update(encounterId, { state: "in_treatment" });
  await writeAudit({
    entityType: "encounter",
    entityId: encounterId,
    action: "critical_fast_path_created",
    newValue: displayNumber,
    mode: "normal",
  });
  return { patient, encounter };
}

export async function setTriage(
  encounterId: string,
  algorithm: TriageAlgorithm,
  level: TriageLevel,
  mode: Mode,
  note?: string,
) {
  const now = Date.now();
  await db.triageAssessments.add({
    id: uuid(),
    encounterId,
    algorithm,
    level,
    performedAt: now,
    note: note ?? null,
  });
  const encounter = await db.encounters.get(encounterId);
  if (encounter && ["arrived", "registered", "waiting", "triaged"].includes(encounter.state)) {
    await db.encounters.update(encounterId, { state: "triaged" });
  }
  await db.clinicalEvents.add({
    id: uuid(),
    encounterId,
    type: "re_triage",
    content: { level, algorithm },
    attachmentBlob: null,
    recordedAt: now,
  });
  await writeAudit({
    entityType: "encounter",
    entityId: encounterId,
    action: "triage_set",
    newValue: String(level),
    mode,
  });
}

export async function getLatestTriage(
  encounterId: string,
): Promise<TriageLevel | null> {
  const rows = await db.triageAssessments
    .where("encounterId")
    .equals(encounterId)
    .sortBy("performedAt");
  return rows.length ? rows[rows.length - 1].level : null;
}

export async function addClinicalEvent(
  encounterId: string,
  type: ClinicalEventType,
  content: Record<string, unknown> | null,
  attachmentBlob: Blob | null,
) {
  const id = uuid();
  await db.clinicalEvents.add({
    id,
    encounterId,
    type,
    content,
    attachmentBlob,
    recordedAt: Date.now(),
  });
  return id;
}

async function addAuditedClinicalEvent(
  encounterId: string,
  type: ClinicalEventType,
  content: Record<string, unknown>,
  mode: Mode,
  action: string,
) {
  const id = await addClinicalEvent(encounterId, type, content, null);
  await writeAudit({
    entityType: type === "order" ? "order" : "encounter",
    entityId: type === "order" ? id : encounterId,
    action,
    newValue: String(content.summary ?? content.name ?? content.status ?? ""),
    actor: typeof content.actor === "string" ? content.actor : null,
    mode,
  });
  return id;
}

export function recordAssessment(
  encounterId: string,
  content: {
    symptoms: string;
    medicalHistory: string;
    examination: string;
    impression: string;
    plan: string;
    actor: string;
  },
  mode: Mode,
) {
  return addAuditedClinicalEvent(encounterId, "assessment", content, mode, "assessment_recorded");
}

export function placeOrder(
  encounterId: string,
  content: { orderType: OrderType; name: string; details: string; priority: "routine" | "urgent" | "stat"; actor: string },
  mode: Mode,
) {
  return addAuditedClinicalEvent(
    encounterId,
    "order",
    { ...content, status: "ordered" satisfies OrderStatus },
    mode,
    "order_placed",
  );
}

export function updateOrderStatus(
  encounterId: string,
  orderId: string,
  status: OrderStatus,
  actor: string,
  reason: string,
  mode: Mode,
) {
  return addAuditedClinicalEvent(
    encounterId,
    "order_status",
    { orderId, status, actor, reason },
    mode,
    `order_${status}`,
  );
}

export async function recordResult(
  encounterId: string,
  orderId: string,
  result: string,
  actor: string,
  critical: boolean,
  mode: Mode,
) {
  const resultId = await addAuditedClinicalEvent(
    encounterId,
    "result",
    { orderId, result, actor, critical, verified: true },
    mode,
    critical ? "critical_result_recorded" : "result_recorded",
  );
  if (critical) {
    await addAuditedClinicalEvent(
      encounterId,
      "critical_alert",
      { resultId, orderId, status: "unacknowledged", actor },
      mode,
      "critical_alert_created",
    );
  }
  return resultId;
}

export function acknowledgeCriticalResult(
  encounterId: string,
  resultId: string,
  actor: string,
  actionTaken: string,
  mode: Mode,
) {
  return addAuditedClinicalEvent(
    encounterId,
    "critical_alert",
    { resultId, status: "acknowledged", actor, actionTaken },
    mode,
    "critical_result_acknowledged",
  );
}

export async function recordTreatment(
  encounterId: string,
  content: { name: string; details: string; actor: string; orderId?: string | null },
  mode: Mode,
) {
  await db.encounters.update(encounterId, { state: "in_treatment" });
  return addAuditedClinicalEvent(encounterId, "treatment", content, mode, "treatment_recorded");
}

export function recordReassessment(
  encounterId: string,
  content: { response: "improved" | "unchanged" | "worse"; painScore: number | null; notes: string; actor: string },
  mode: Mode,
) {
  return addAuditedClinicalEvent(encounterId, "reassessment", content, mode, "reassessment_recorded");
}

export async function setDispositionDecision(
  encounterId: string,
  disposition: Disposition,
  actor: string,
  details: string,
  mode: Mode,
) {
  const stateMap: Partial<Record<Disposition, EncounterState>> = {
    admitted: "admission_pending",
    icu: "admission_pending",
    ward: "admission_pending",
    operating_room: "admission_pending",
    observation: "observation",
    transferred: "transfer_pending",
    discharged: "discharge_pending",
  };
  await db.encounters.update(encounterId, {
    disposition,
    state: stateMap[disposition] ?? "disposition_pending",
    closedAt: null,
  });
  return addAuditedClinicalEvent(
    encounterId,
    "disposition",
    { disposition, status: "decision_recorded", actor, details },
    mode,
    "disposition_decided",
  );
}

export async function updateDispositionProgress(
  encounterId: string,
  status: string,
  actor: string,
  details: string,
  closesEncounter: boolean,
  mode: Mode,
) {
  if (closesEncounter) {
    const encounter = await db.encounters.get(encounterId);
    const terminalState: EncounterState = encounter?.disposition === "transferred" ? "transferred_out" : "closed";
    await db.encounters.update(encounterId, { state: terminalState, closedAt: Date.now() });
  }
  return addAuditedClinicalEvent(
    encounterId,
    "disposition_status",
    { status, actor, details, closesEncounter },
    mode,
    `disposition_${status}`,
  );
}

export async function assignLocation(
  encounterId: string,
  locationName: string,
  zone: string,
  mode: Mode,
) {
  const now = Date.now();
  // release any prior open assignment
  const open = await db.locationAssignments
    .where("encounterId")
    .equals(encounterId)
    .filter((a) => a.releasedAt === null)
    .toArray();
  for (const a of open) {
    await db.locationAssignments.update(a.id, { releasedAt: now });
  }
  await db.locationAssignments.add({
    id: uuid(),
    encounterId,
    locationName,
    zone,
    assignedAt: now,
    releasedAt: null,
  });
  const prev = (await db.encounters.get(encounterId))?.currentLocationName ?? null;
  await db.encounters.update(encounterId, {
    currentLocationName: locationName,
    currentZone: zone,
  });
  await db.clinicalEvents.add({
    id: uuid(),
    encounterId,
    type: "location",
    content: { locationName, zone },
    attachmentBlob: null,
    recordedAt: now,
  });
  await writeAudit({
    entityType: "encounter",
    entityId: encounterId,
    action: "location_assigned",
    previousValue: prev,
    newValue: locationName,
    mode,
  });
}

export async function setDisposition(
  encounterId: string,
  disposition: Disposition,
  mode: Mode,
) {
  const now = Date.now();
  const stateMap: Record<Disposition, EncounterState> = {
    admitted: "closed",
    icu: "closed",
    ward: "closed",
    operating_room: "closed",
    observation: "observation",
    discharged: "closed",
    transferred: "transferred_out",
    deceased: "closed",
    left_without_being_seen: "left_without_being_seen",
    left_against_medical_advice: "closed",
    absconded: "absconded",
    unknown_status: "unknown_status",
  };
  await db.encounters.update(encounterId, {
    disposition,
    state: stateMap[disposition],
    closedAt: now,
  });
  await db.clinicalEvents.add({
    id: uuid(),
    encounterId,
    type: "disposition",
    content: { disposition },
    attachmentBlob: null,
    recordedAt: now,
  });
  await writeAudit({
    entityType: "encounter",
    entityId: encounterId,
    action: "disposition_set",
    newValue: disposition,
    mode,
  });
}

export async function assignTeam(
  encounterId: string,
  provider: string,
  mode: Mode,
) {
  const prev = (await db.encounters.get(encounterId))?.currentProvider ?? null;
  await db.encounters.update(encounterId, { currentProvider: provider });
  await db.clinicalEvents.add({
    id: uuid(),
    encounterId,
    type: "team",
    content: { provider },
    attachmentBlob: null,
    recordedAt: Date.now(),
  });
  await writeAudit({
    entityType: "encounter",
    entityId: encounterId,
    action: "team_assigned",
    previousValue: prev,
    newValue: provider,
    mode,
  });
}

export async function updatePatientField(
  patientId: string,
  field: keyof Patient,
  value: unknown,
  mode: Mode,
) {
  const patient = await db.patients.get(patientId);
  const prev = patient ? String((patient as unknown as Record<string, unknown>)[field] ?? "") : "";
  await db.patients.update(patientId, { [field]: value } as Partial<Patient>);
  await writeAudit({
    entityType: "patient",
    entityId: patientId,
    action: `field_updated:${String(field)}`,
    previousValue: prev,
    newValue: String(value ?? ""),
    mode,
  });
}

export async function updateEncounterField(
  encounterId: string,
  field: keyof Encounter,
  value: unknown,
  mode: Mode,
) {
  const encounter = await db.encounters.get(encounterId);
  const prev = encounter
    ? String((encounter as unknown as Record<string, unknown>)[field] ?? "")
    : "";
  await db.encounters.update(encounterId, { [field]: value } as Partial<Encounter>);
  await writeAudit({
    entityType: "encounter",
    entityId: encounterId,
    action: `field_updated:${String(field)}`,
    previousValue: prev,
    newValue: String(value ?? ""),
    mode,
  });
}

export async function addAllergy(encounterId: string, allergy: string, mode: Mode) {
  const encounter = await db.encounters.get(encounterId);
  if (!encounter) return;
  const allergies = [...encounter.allergies, allergy];
  await db.encounters.update(encounterId, { allergies });
  await writeAudit({
    entityType: "encounter",
    entityId: encounterId,
    action: "allergy_added",
    newValue: allergy,
    mode,
  });
}

export async function removeAllergy(encounterId: string, allergy: string, mode: Mode) {
  const encounter = await db.encounters.get(encounterId);
  if (!encounter) return;
  const allergies = encounter.allergies.filter((a) => a !== allergy);
  await db.encounters.update(encounterId, { allergies });
  await writeAudit({
    entityType: "encounter",
    entityId: encounterId,
    action: "allergy_removed",
    previousValue: allergy,
    mode,
  });
}
