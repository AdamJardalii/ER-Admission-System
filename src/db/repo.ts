import { db } from "./db";
import { uuid, nextCaseNumber, nextDisplayNumber, nextMrn } from "./ids";
import { writeAudit } from "./audit";
import { calculateBmi, implausibleFields, scoreNews2 } from "../lib/vitals";
import type {
  AgeBand,
  Avpu,
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
  VitalsSet,
} from "../types";

export interface PatientWithEncounter {
  patient: Patient;
  encounter: Encounter;
  triage: TriageLevel | null;
}

export async function transitionEncounterState(
  encounterId: string,
  newState: EncounterState,
  params: {
    reason?: string | null;
    actor?: string | null;
    mode: Mode;
    device?: string | null;
    source?: "online" | "offline" | "local";
  },
) {
  const encounter = await db.encounters.get(encounterId);
  const previousState = encounter?.state ?? null;
  if (!encounter || previousState === newState) return;
  const now = Date.now();
  await db.transaction("rw", db.encounters, db.stateTransitions, db.clinicalEvents, async () => {
    await db.encounters.update(encounterId, { state: newState, updatedAt: now });
    await db.stateTransitions.add({
      id: uuid(),
      encounterId,
      previousState,
      newState,
      reason: params.reason ?? null,
      actor: params.actor ?? null,
      device: params.device ?? "local browser",
      source: params.source ?? "local",
      timestamp: now,
    });
    await db.clinicalEvents.add({
      id: uuid(),
      encounterId,
      type: "state_transition",
      content: {
        previousState,
        newState,
        reason: params.reason ?? null,
        actor: params.actor ?? null,
      },
      attachmentBlob: null,
      recordedAt: now,
    });
  });
  await writeAudit({
    entityType: "encounter",
    entityId: encounterId,
    action: "state_transition",
    previousValue: previousState,
    newValue: newState,
    actor: params.actor ?? null,
    mode: params.mode,
  });
}

export interface QuickRegistrationInput {
  name: string;
  sex: Patient["sex"];
  dob: string | null;
  estimatedAgeRange: AgeBand | null;
  chiefComplaint: string;
  duplicateOverride?: boolean;
}

export async function createQuickRegistration(input: QuickRegistrationInput) {
  const now = Date.now();
  const patientId = uuid();
  const encounterId = uuid();
  const displayNumber = nextDisplayNumber("normal");
  const mrn = nextMrn();
  const caseNumber = nextCaseNumber();
  const patient: Patient = {
    id: patientId,
    displayNumber,
    mrn,
    name: input.name.trim() || null,
    dateOfBirth: input.dob || null,
    sex: input.sex ?? "unknown",
    phone: null,
    photoBlob: null,
    identityStatus: input.name.trim() ? "provisional" : "unknown",
    estimatedAgeRange: input.estimatedAgeRange,
    registrationComplete: false,
    duplicateOverride: Boolean(input.duplicateOverride),
    catastropheTags: [],
    mergedIntoPatientId: null,
    mergedAt: null,
    mergeUndoneAt: null,
    createdAt: now,
  };
  const encounter: Encounter = {
    id: encounterId,
    caseNumber,
    patientId,
    incidentId: null,
    modeAtCreation: "normal",
    pathway: "standard",
    arrivedAt: now,
    state: "registered",
    disposition: null,
    closedAt: null,
    chiefComplaint: input.chiefComplaint.trim() || null,
    arrivalMethod: "walk_in",
    referralSource: null,
    allergies: [],
    currentLocationName: null,
    currentZone: null,
    currentProvider: null,
    updatedAt: now,
  };
  await db.transaction("rw", db.patients, db.encounters, db.patientIdentifiers, db.clinicalEvents, db.stateTransitions, async () => {
    await db.patients.add(patient);
    await db.patientIdentifiers.add({ id: uuid(), patientId, type: "mrn", value: mrn, createdAt: now });
    await db.encounters.add(encounter);
    await db.clinicalEvents.add({
      id: uuid(),
      encounterId,
      type: "created",
      content: { displayNumber, caseNumber, mrn, registrationDepth: "quick" },
      attachmentBlob: null,
      recordedAt: now,
    });
    await db.stateTransitions.add({
      id: uuid(),
      encounterId,
      previousState: null,
      newState: "registered",
      reason: "Quick registration",
      actor: "Registrar",
      device: "local browser",
      source: "local",
      timestamp: now,
    });
  });
  await writeAudit({
    entityType: "encounter",
    entityId: encounterId,
    action: "quick_registered",
    newValue: caseNumber,
    mode: "normal",
  });
  if (input.duplicateOverride) {
    await writeAudit({
      entityType: "patient",
      entityId: patientId,
      action: "duplicate_override",
      newValue: input.name,
      mode: "normal",
    });
  }
  return { patient, encounter };
}

export async function createEncounterForExistingPatient(patient: Patient, chiefComplaint: string | null) {
  const now = Date.now();
  const encounterId = uuid();
  const caseNumber = nextCaseNumber();
  const encounter: Encounter = {
    id: encounterId,
    caseNumber,
    patientId: patient.id,
    incidentId: null,
    modeAtCreation: "normal",
    pathway: "standard",
    arrivedAt: now,
    state: "registered",
    disposition: null,
    closedAt: null,
    chiefComplaint: chiefComplaint || null,
    arrivalMethod: "walk_in",
    referralSource: null,
    allergies: [],
    currentLocationName: null,
    currentZone: null,
    currentProvider: null,
    updatedAt: now,
  };
  await db.transaction("rw", db.encounters, db.clinicalEvents, db.stateTransitions, async () => {
    await db.encounters.add(encounter);
    await db.clinicalEvents.add({
      id: uuid(),
      encounterId,
      type: "created",
      content: { caseNumber, mrn: patient.mrn, returningPatient: true },
      attachmentBlob: null,
      recordedAt: now,
    });
    await db.stateTransitions.add({
      id: uuid(),
      encounterId,
      previousState: null,
      newState: "registered",
      reason: "Returning patient encounter created",
      actor: "Registrar",
      device: "local browser",
      source: "local",
      timestamp: now,
    });
  });
  await writeAudit({
    entityType: "encounter",
    entityId: encounterId,
    action: "created_from_existing_mrn",
    newValue: caseNumber,
    mode: "normal",
  });
  return encounter;
}

export async function completeRegistration(
  patientId: string,
  updates: Partial<Patient>,
  encounterId: string | null,
  mode: Mode,
) {
  const patient = await db.patients.get(patientId);
  if (!patient) return;
  const fullUpdates: Partial<Patient> = {
    ...updates,
    registrationComplete: true,
    identityStatus: updates.name || patient.name ? "confirmed" : patient.identityStatus,
  };
  await db.patients.update(patientId, fullUpdates);
  const changed = Object.entries(fullUpdates).filter(([key, value]) => {
    const old = (patient as unknown as Record<string, unknown>)[key];
    return JSON.stringify(old ?? null) !== JSON.stringify(value ?? null);
  });
  for (const [key, value] of changed) {
    await writeAudit({
      entityType: "patient",
      entityId: patientId,
      action: `field_updated:${key}`,
      previousValue: String((patient as unknown as Record<string, unknown>)[key] ?? ""),
      newValue: String(value ?? ""),
      mode,
    });
  }
  if (fullUpdates.nationalId) {
    const existing = await db.patientIdentifiers
      .where("patientId")
      .equals(patientId)
      .filter((id) => id.type === "national_id" && id.value === fullUpdates.nationalId)
      .first();
    if (!existing) {
      await db.patientIdentifiers.add({
        id: uuid(),
        patientId,
        type: "national_id",
        value: String(fullUpdates.nationalId),
        createdAt: Date.now(),
      });
    }
  }
  if (encounterId) {
    await db.clinicalEvents.add({
      id: uuid(),
      encounterId,
      type: "note",
      content: { text: "Registration completed", actor: "Registrar" },
      attachmentBlob: null,
      recordedAt: Date.now(),
    });
  }
}

export interface VitalsInput {
  temperature?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  systolicBp?: number | null;
  diastolicBp?: number | null;
  spo2?: number | null;
  supplementalO2?: boolean;
  consciousness?: Avpu;
  painScore?: number | null;
  bloodGlucose?: number | null;
  weightKg?: number | null;
  heightCm?: number | null;
  gcsEye?: number | null;
  gcsVerbal?: number | null;
  gcsMotor?: number | null;
  source?: VitalsSet["source"];
}

export async function recordVitalsSet(encounterId: string, input: VitalsInput, mode: Mode) {
  const encounter = await db.encounters.get(encounterId);
  if (!encounter) throw new Error("Encounter not found");
  const now = Date.now();
  const values = {
    temperature: input.temperature ?? null,
    heartRate: input.heartRate ?? null,
    respiratoryRate: input.respiratoryRate ?? null,
    systolicBp: input.systolicBp ?? null,
    diastolicBp: input.diastolicBp ?? null,
    spo2: input.spo2 ?? null,
    painScore: input.painScore ?? null,
    bloodGlucose: input.bloodGlucose ?? null,
    weightKg: input.weightKg ?? null,
    heightCm: input.heightCm ?? null,
  };
  const bmi = calculateBmi(values.weightKg, values.heightCm);
  const gcsTotal = input.gcsEye && input.gcsVerbal && input.gcsMotor ? input.gcsEye + input.gcsVerbal + input.gcsMotor : null;
  const news = scoreNews2({
    respiratoryRate: values.respiratoryRate,
    spo2: values.spo2,
    supplementalO2: Boolean(input.supplementalO2),
    temperature: values.temperature,
    systolicBp: values.systolicBp,
    heartRate: values.heartRate,
    consciousness: input.consciousness ?? "Alert",
  });
  const vitals: VitalsSet = {
    id: uuid(),
    encounterId,
    patientId: encounter.patientId,
    recordedAt: now,
    ...values,
    supplementalO2: Boolean(input.supplementalO2),
    consciousness: input.consciousness ?? "Alert",
    bmi,
    gcsEye: input.gcsEye ?? null,
    gcsVerbal: input.gcsVerbal ?? null,
    gcsMotor: input.gcsMotor ?? null,
    gcsTotal,
    news2: news.score,
    news2Breakdown: news.breakdown,
    implausibleFields: implausibleFields(values),
    source: input.source ?? "full",
  };
  await db.transaction("rw", db.vitalsSets, db.clinicalEvents, async () => {
    await db.vitalsSets.add(vitals);
    await db.clinicalEvents.add({
      id: uuid(),
      encounterId,
      type: "vitals",
      content: {
        vitalsSetId: vitals.id,
        bp: values.systolicBp && values.diastolicBp ? `${values.systolicBp}/${values.diastolicBp}` : values.systolicBp ?? null,
        hr: values.heartRate,
        rr: values.respiratoryRate,
        spo2: values.spo2,
        temp: values.temperature,
        news2: vitals.news2,
        source: vitals.source,
      },
      attachmentBlob: null,
      recordedAt: now,
    });
  });
  await writeAudit({
    entityType: "vitals",
    entityId: vitals.id,
    action: "vitals_recorded",
    newValue: `NEWS2 ${vitals.news2}`,
    mode,
  });
  return vitals;
}

export async function deleteVitalsSet(vitalsSetId: string, mode: Mode) {
  const vitals = await db.vitalsSets.get(vitalsSetId);
  if (!vitals) return;
  const now = Date.now();
  await db.transaction("rw", db.vitalsSets, db.clinicalEvents, async () => {
    await db.vitalsSets.update(vitalsSetId, {
      voidedAt: now,
      voidReason: "Undo requested within save window",
    });
    await db.clinicalEvents.add({
      id: uuid(),
      encounterId: vitals.encounterId,
      type: "correction",
      content: {
        targetType: "vitals",
        targetId: vitalsSetId,
        reason: "Undo requested within save window",
      },
      attachmentBlob: null,
      recordedAt: now,
    });
  });
  await writeAudit({
    entityType: "vitals",
    entityId: vitalsSetId,
    action: "vitals_undone",
    previousValue: `NEWS2 ${vitals.news2}`,
    mode,
  });
}

export async function mergePatientRecords(
  survivorPatientId: string,
  sourcePatientId: string,
  selectedValues: Partial<Patient>,
  mode: Mode,
) {
  if (survivorPatientId === sourcePatientId) return null;
  const now = Date.now();
  const source = await db.patients.get(sourcePatientId);
  if (!source) return null;
  const encounters = await db.encounters.where("patientId").equals(sourcePatientId).toArray();
  const identifiers = await db.patientIdentifiers.where("patientId").equals(sourcePatientId).toArray();
  const mergeId = uuid();
  await db.transaction("rw", db.patients, db.encounters, db.vitalsSets, db.patientIdentifiers, db.mergeRecords, async () => {
    await db.patients.update(survivorPatientId, selectedValues);
    for (const encounter of encounters) await db.encounters.update(encounter.id, { patientId: survivorPatientId });
    const sourceVitals = await db.vitalsSets.where("patientId").equals(sourcePatientId).toArray();
    for (const vitals of sourceVitals) await db.vitalsSets.update(vitals.id, { patientId: survivorPatientId });
    for (const identifier of identifiers) await db.patientIdentifiers.update(identifier.id, { patientId: survivorPatientId });
    for (const tag of [source.displayNumber, ...(source.catastropheTags ?? [])].filter((value) => value.startsWith("#B-"))) {
      const existing = await db.patientIdentifiers.where("value").equals(tag).first();
      if (!existing) await db.patientIdentifiers.add({ id: uuid(), patientId: survivorPatientId, type: "catastrophe_tag", value: tag, createdAt: now });
    }
    await db.patients.update(sourcePatientId, { mergedIntoPatientId: survivorPatientId, mergedAt: now, mergeUndoneAt: null });
    await db.mergeRecords.add({
      id: mergeId,
      survivorPatientId,
      sourcePatientId,
      mergedAt: now,
      undoneAt: null,
      selectedValues,
      movedEncounterIds: encounters.map((encounter) => encounter.id),
      movedIdentifierIds: identifiers.map((identifier) => identifier.id),
    });
  });
  await writeAudit({ entityType: "patient", entityId: survivorPatientId, action: "records_merged", newValue: sourcePatientId, mode });
  await writeAudit({ entityType: "patient", entityId: sourcePatientId, action: "merged_into", newValue: survivorPatientId, mode });
  return mergeId;
}

export async function unmergePatientRecord(mergeId: string, mode: Mode) {
  const merge = await db.mergeRecords.get(mergeId);
  if (!merge || merge.undoneAt) return;
  const now = Date.now();
  await db.transaction("rw", db.patients, db.encounters, db.vitalsSets, db.patientIdentifiers, db.mergeRecords, async () => {
    for (const encounterId of merge.movedEncounterIds) await db.encounters.update(encounterId, { patientId: merge.sourcePatientId });
    const sourceVitals = await db.vitalsSets.where("patientId").equals(merge.survivorPatientId).toArray();
    for (const vitals of sourceVitals.filter((set) => merge.movedEncounterIds.includes(set.encounterId))) {
      await db.vitalsSets.update(vitals.id, { patientId: merge.sourcePatientId });
    }
    for (const identifierId of merge.movedIdentifierIds) await db.patientIdentifiers.update(identifierId, { patientId: merge.sourcePatientId });
    await db.patients.update(merge.sourcePatientId, { mergedIntoPatientId: null, mergeUndoneAt: now });
    await db.mergeRecords.update(mergeId, { undoneAt: now });
  });
  await writeAudit({ entityType: "patient", entityId: merge.survivorPatientId, action: "records_unmerged", newValue: merge.sourcePatientId, mode });
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
    pathway: "catastrophe",
    arrivedAt: now,
    state: "arrived",
    disposition: null,
    closedAt: null,
    chiefComplaint: null,
    allergies: [],
    currentLocationName: null,
    currentZone: null,
    currentProvider: null,
    updatedAt: now,
  };

  await db.transaction("rw", db.patients, db.encounters, db.clinicalEvents, db.stateTransitions, async () => {
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
    await db.stateTransitions.add({
      id: uuid(),
      encounterId,
      previousState: null,
      newState: "arrived",
      reason: "Catastrophe tag created",
      actor: "Incident team",
      device: "local browser",
      source: "local",
      timestamp: now,
    });
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
    pathway: "critical",
    arrivedAt: now,
    state: "resuscitation",
    disposition: null,
    closedAt: null,
    chiefComplaint: "Critical patient - immediate treatment",
    allergies: [],
    currentLocationName: "Resuscitation",
    currentZone: "zone-trauma",
    currentProvider: null,
    updatedAt: now,
  };
  await db.transaction("rw", db.patients, db.encounters, db.clinicalEvents, db.stateTransitions, async () => {
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
    await db.stateTransitions.add({
      id: uuid(),
      encounterId,
      previousState: null,
      newState: "resuscitation",
      reason: "Immediate danger - direct to resuscitation",
      actor: "Triage nurse",
      device: "local browser",
      source: "local",
      timestamp: now,
    });
  });
  await setTriage(encounterId, "esi", 1, "normal", "Immediate danger - registration deferred");
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
    await transitionEncounterState(encounterId, "triaged", {
      reason: note ?? "Triage assessment recorded",
      actor: algorithm === "esi" ? "Triage nurse" : "Incident team",
      mode,
    });
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

export async function recordAssessment(
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
  await transitionEncounterState(encounterId, "in_assessment", {
    reason: "Clinician assessment started",
    actor: content.actor,
    mode,
  });
  return addAuditedClinicalEvent(encounterId, "assessment", content, mode, "assessment_recorded");
}

export async function placeOrder(
  encounterId: string,
  content: { orderType: OrderType; name: string; details: string; priority: "routine" | "urgent" | "stat"; actor: string },
  mode: Mode,
) {
  await transitionEncounterState(encounterId, "orders_pending", {
    reason: `${content.orderType} order placed`,
    actor: content.actor,
    mode,
  });
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
  await transitionEncounterState(encounterId, "in_treatment", {
    reason: content.name,
    actor: content.actor,
    mode,
  });
  return addAuditedClinicalEvent(encounterId, "treatment", content, mode, "treatment_recorded");
}

export function administerMedication(
  encounterId: string,
  content: {
    medicationOrderId: string;
    medication: string;
    prescribedDose: string;
    administeredDose: string;
    route: string;
    actor: string;
    response: string;
    notAdministeredReason?: string | null;
  },
  mode: Mode,
) {
  return addAuditedClinicalEvent(
    encounterId,
    "medication",
    content,
    mode,
    content.notAdministeredReason ? "medication_not_administered" : "medication_administered",
  );
}

export async function recordReassessment(
  encounterId: string,
  content: { response: "improved" | "unchanged" | "worse"; painScore: number | null; notes: string; actor: string },
  mode: Mode,
) {
  await transitionEncounterState(encounterId, "reassessment_required", {
    reason: `Reassessment: ${content.response}`,
    actor: content.actor,
    mode,
  });
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
    closedAt: null,
  });
  await transitionEncounterState(encounterId, stateMap[disposition] ?? "disposition_pending", {
    reason: details || `Disposition decision: ${disposition}`,
    actor,
    mode,
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
    await transitionEncounterState(encounterId, terminalState, {
      reason: details || status,
      actor,
      mode,
    });
    await db.encounters.update(encounterId, { closedAt: Date.now() });
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
  const updated = await db.encounters.get(encounterId);
  if (updated && ["triaged", "waiting"].includes(updated.state)) {
    await transitionEncounterState(encounterId, "assigned", {
      reason: `Assigned to ${locationName}`,
      actor: "Charge nurse",
      mode,
    });
  }
}

export async function setEncounterPathway(
  encounterId: string,
  pathway: NonNullable<Encounter["pathway"]>,
  mode: Mode,
  reason: string,
  actor = "Current clinician",
) {
  const stateByPathway: Partial<Record<NonNullable<Encounter["pathway"]>, EncounterState>> = {
    standard: "triaged",
    fast_track: "fast_track",
    critical: "resuscitation",
    catastrophe: "triaged",
  };
  const now = Date.now();
  const encounter = await db.encounters.get(encounterId);
  const previous = encounter?.pathway ?? null;
  await db.encounters.update(encounterId, { pathway, updatedAt: now });
  await transitionEncounterState(encounterId, stateByPathway[pathway] ?? "triaged", {
    reason,
    actor,
    mode,
  });
  await writeAudit({
    entityType: "encounter",
    entityId: encounterId,
    action: "pathway_changed",
    previousValue: previous,
    newValue: pathway,
    actor,
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
