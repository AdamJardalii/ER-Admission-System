import { db } from "./db";
import { uuid, nextCaseNumber, nextDisplayNumber, nextMrn } from "./ids";
import { writeAudit } from "./audit";
import { calculateBmi, implausibleFields, scoreNews2 } from "../lib/vitals";
import { canTransitionOrderStatus, resultReviewStatus } from "../lib/clinicalWorkflow";
import {
  assertEncounterTransition,
  legacyStateForWorkflowStatus,
  workflowStatusForEncounter,
  workflowStatusFromLegacy,
} from "../domain/encounterStateMachine";
import { resolvePrototypeActor } from "../domain/prototypeUser";
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
  EncounterStatus,
  Disposition,
  OrderStatus,
  OrderType,
  VitalsSet,
  PatientIdentifier,
  RelatedPerson,
  InsurancePolicy,
  CivilRegistryRecord,
  EmploymentRecord,
  MilitaryRecord,
  PendingCase,
  MedicationRecord,
  AllergyRecord,
  ConditionRecord,
  OrderRecord,
  ResultRecord,
  ImmunizationRecord,
  ProcedureRecord,
  ProgramRecord,
  BillingItem,
  Attachment,
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
    workflowStatus?: EncounterStatus;
    enforceWorkflow?: boolean;
    metadata?: Record<string, unknown>;
  },
) {
  const encounter = await db.encounters.get(encounterId);
  if (!encounter) {
    if (params.enforceWorkflow) throw new Error("Encounter not found.");
    return;
  }

  const previousState = encounter.state;
  const previousWorkflowStatus = workflowStatusForEncounter(encounter);
  const nextWorkflowStatus = params.workflowStatus ?? workflowStatusFromLegacy(newState, encounter.disposition);
  if (params.enforceWorkflow && previousWorkflowStatus !== nextWorkflowStatus) {
    assertEncounterTransition(previousWorkflowStatus, nextWorkflowStatus);
  }
  if (previousState === newState && previousWorkflowStatus === nextWorkflowStatus) return encounter;

  const now = Date.now();
  const occurredAt = new Date(now).toISOString();
  const actor = resolvePrototypeActor(params.actor);
  await db.transaction("rw", db.encounters, db.stateTransitions, db.clinicalEvents, async () => {
    await db.encounters.update(encounterId, {
      state: newState,
      workflowStatus: nextWorkflowStatus,
      updatedAt: now,
    });
    await db.stateTransitions.add({
      id: uuid(),
      encounterId,
      previousState,
      newState,
      reason: params.reason ?? null,
      actor: actor.actorName,
      device: params.device ?? "local browser",
      source: params.source ?? "local",
      timestamp: now,
      workflowFromStatus: previousWorkflowStatus,
      workflowToStatus: nextWorkflowStatus,
      actorId: actor.actorId,
      actorName: actor.actorName,
      occurredAt,
      metadata: params.metadata,
    });
    await db.clinicalEvents.add({
      id: uuid(),
      encounterId,
      type: "state_transition",
      content: {
        previousState,
        newState,
        fromStatus: previousWorkflowStatus,
        toStatus: nextWorkflowStatus,
        reason: params.reason ?? null,
        actorId: actor.actorId,
        actorName: actor.actorName,
        occurredAt,
        metadata: params.metadata,
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
    actor: actor.actorName,
    actorId: actor.actorId,
    demoRole: actor.demoRole,
    encounterId,
    patientId: encounter.patientId,
    reason: params.reason ?? null,
    metadata: {
      fromStatus: previousWorkflowStatus,
      toStatus: nextWorkflowStatus,
      ...params.metadata,
    },
    mode: params.mode,
  });
  return { ...encounter, state: newState, workflowStatus: nextWorkflowStatus, updatedAt: now };
}

export async function transitionEncounterWorkflowStatus(
  encounterId: string,
  toStatus: EncounterStatus,
  params: {
    reason?: string | null;
    actor?: string | null;
    mode: Mode;
    device?: string | null;
    source?: "online" | "offline" | "local";
    metadata?: Record<string, unknown>;
  },
) {
  return transitionEncounterState(encounterId, legacyStateForWorkflowStatus(toStatus), {
    ...params,
    workflowStatus: toStatus,
    enforceWorkflow: true,
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
    patientType: input.name.trim() ? "standard" : "unknown",
    confidentialityLevel: "normal",
    name: input.name.trim() || null,
    dateOfBirth: input.dob || null,
    sex: input.sex ?? "unknown",
    sexAtBirth: input.sex ?? "unknown",
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
    isSynthetic: true,
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
    workflowStatus: "ARRIVED",
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
  const createdActor = resolvePrototypeActor("Registrar");
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
      actor: createdActor.actorName,
      device: "local browser",
      source: "local",
      timestamp: now,
      workflowFromStatus: null,
      workflowToStatus: "ARRIVED",
      actorId: createdActor.actorId,
      actorName: createdActor.actorName,
      occurredAt: new Date(now).toISOString(),
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
    workflowStatus: "ARRIVED",
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
  const createdActor = resolvePrototypeActor("Registrar");
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
      actor: createdActor.actorName,
      device: "local browser",
      source: "local",
      timestamp: now,
      workflowFromStatus: null,
      workflowToStatus: "ARRIVED",
      actorId: createdActor.actorId,
      actorName: createdActor.actorName,
      occurredAt: new Date(now).toISOString(),
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
    isSynthetic: true,
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
    workflowStatus: "ARRIVED",
    disposition: null,
    closedAt: null,
    chiefComplaint: null,
    allergies: [],
    currentLocationName: null,
    currentZone: null,
    currentProvider: null,
    updatedAt: now,
  };
  const createdActor = resolvePrototypeActor("Incident team");

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
      actor: createdActor.actorName,
      device: "local browser",
      source: "local",
      timestamp: now,
      workflowFromStatus: null,
      workflowToStatus: "ARRIVED",
      actorId: createdActor.actorId,
      actorName: createdActor.actorName,
      occurredAt: new Date(now).toISOString(),
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
    patientType: "unknown",
    confidentialityLevel: "normal",
    name: null,
    dateOfBirth: null,
    sex: "unknown",
    sexAtBirth: "unknown",
    phone: null,
    photoBlob: null,
    identityStatus: "provisional",
    estimatedAgeRange: null,
    isSynthetic: true,
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
    workflowStatus: "ROOMED",
    disposition: null,
    closedAt: null,
    chiefComplaint: "Critical patient - immediate treatment",
    allergies: [],
    currentLocationName: "Resuscitation",
    currentZone: "zone-trauma",
    currentProvider: null,
    updatedAt: now,
  };
  const createdActor = resolvePrototypeActor("Triage nurse");
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
      actor: createdActor.actorName,
      device: "local browser",
      source: "local",
      timestamp: now,
      workflowFromStatus: null,
      workflowToStatus: "ROOMED",
      actorId: createdActor.actorId,
      actorName: createdActor.actorName,
      occurredAt: new Date(now).toISOString(),
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

export async function addPatientIdentifier(
  input: Omit<PatientIdentifier, "id" | "createdAt"> & { createdAt?: number },
  mode: Mode,
) {
  const now = Date.now();
  const row: PatientIdentifier = {
    ...input,
    id: uuid(),
    createdAt: input.createdAt ?? now,
    verificationStatus: input.verificationStatus ?? "unverified",
  };
  const existingSamePatient = await db.patientIdentifiers
    .where("patientId")
    .equals(row.patientId)
    .filter((candidate) => candidate.type === row.type && candidate.value === row.value)
    .first();
  if (existingSamePatient) return existingSamePatient;
  const duplicate = await db.patientIdentifiers
    .where("value")
    .equals(row.value)
    .filter((candidate) => candidate.patientId !== row.patientId && candidate.type === row.type)
    .first();
  if (duplicate) throw new Error("Identifier already belongs to another patient.");
  if (row.isPrimary) {
    const existing = await db.patientIdentifiers.where("patientId").equals(row.patientId).toArray();
    await Promise.all(existing.filter((candidate) => candidate.type === row.type).map((candidate) => db.patientIdentifiers.update(candidate.id, { isPrimary: false })));
  }
  await db.patientIdentifiers.add(row);
  await writeAudit({ entityType: "patient_identifier", entityId: row.id, action: "identifier_added", newValue: `${row.type}:${row.value}`, mode });
  return row;
}

export async function updatePatientIdentifier(id: string, updates: Partial<PatientIdentifier>, mode: Mode) {
  const existing = await db.patientIdentifiers.get(id);
  if (!existing) return;
  if (updates.value && updates.value !== existing.value) {
    const duplicate = await db.patientIdentifiers
      .where("value")
      .equals(updates.value)
      .filter((candidate) => candidate.patientId !== existing.patientId && candidate.type === (updates.type ?? existing.type))
      .first();
    if (duplicate) throw new Error("Identifier already belongs to another patient.");
  }
  if (updates.isPrimary) {
    const rows = await db.patientIdentifiers.where("patientId").equals(existing.patientId).toArray();
    await Promise.all(rows.filter((candidate) => candidate.id !== id && candidate.type === (updates.type ?? existing.type)).map((candidate) => db.patientIdentifiers.update(candidate.id, { isPrimary: false })));
  }
  await db.patientIdentifiers.update(id, updates);
  await writeAudit({ entityType: "patient_identifier", entityId: id, action: "identifier_updated", previousValue: existing.value, newValue: updates.value ?? existing.value, mode });
}

export async function removePatientIdentifier(id: string, mode: Mode) {
  const row = await db.patientIdentifiers.get(id);
  await db.patientIdentifiers.delete(id);
  await writeAudit({ entityType: "patient_identifier", entityId: id, action: "identifier_removed", previousValue: row?.value ?? null, mode });
}

export async function addRelatedPerson(input: Omit<RelatedPerson, "id" | "createdAt" | "updatedAt">, mode: Mode) {
  const now = Date.now();
  const row: RelatedPerson = { ...input, id: uuid(), createdAt: now, updatedAt: now };
  await db.relatedPersons.add(row);
  await writeAudit({ entityType: "related_person", entityId: row.id, action: "related_person_added", newValue: row.fullName, mode });
  return row;
}

export async function updateRelatedPerson(id: string, updates: Partial<RelatedPerson>, mode: Mode) {
  await db.relatedPersons.update(id, { ...updates, updatedAt: Date.now() });
  await writeAudit({ entityType: "related_person", entityId: id, action: "related_person_updated", newValue: updates.fullName ?? null, mode });
}

export async function removeRelatedPerson(id: string, mode: Mode) {
  const row = await db.relatedPersons.get(id);
  await db.relatedPersons.delete(id);
  await writeAudit({ entityType: "related_person", entityId: id, action: "related_person_removed", previousValue: row?.fullName ?? null, mode });
}

export async function addInsurancePolicy(input: Omit<InsurancePolicy, "id" | "createdAt" | "updatedAt">, mode: Mode) {
  const now = Date.now();
  const row: InsurancePolicy = { ...input, id: uuid(), createdAt: now, updatedAt: now };
  if (row.isDefault) {
    const existing = await db.insurancePolicies.where("patientId").equals(row.patientId).toArray();
    await Promise.all(existing.map((policy) => db.insurancePolicies.update(policy.id, { isDefault: false })));
    await db.patients.update(row.patientId, { defaultInsuranceId: row.id, insuranceProvider: row.payerName, insurancePolicyNumber: row.policyNumber ?? row.membershipNumber ?? null });
  }
  await db.insurancePolicies.add(row);
  await writeAudit({ entityType: "insurance_policy", entityId: row.id, action: "insurance_added", newValue: row.payerName, mode });
  return row;
}

export async function updateInsurancePolicy(id: string, updates: Partial<InsurancePolicy>, mode: Mode) {
  const existing = await db.insurancePolicies.get(id);
  if (!existing) return;
  const next = { ...updates, updatedAt: Date.now() };
  if (updates.isDefault) {
    const rows = await db.insurancePolicies.where("patientId").equals(existing.patientId).toArray();
    await Promise.all(rows.filter((policy) => policy.id !== id).map((policy) => db.insurancePolicies.update(policy.id, { isDefault: false })));
    await db.patients.update(existing.patientId, {
      defaultInsuranceId: id,
      insuranceProvider: updates.payerName ?? existing.payerName,
      insurancePolicyNumber: updates.policyNumber ?? updates.membershipNumber ?? existing.policyNumber ?? existing.membershipNumber ?? null,
    });
  }
  await db.insurancePolicies.update(id, next);
  await writeAudit({ entityType: "insurance_policy", entityId: id, action: "insurance_updated", newValue: updates.payerName ?? updates.policyNumber ?? null, mode });
}

export async function removeInsurancePolicy(id: string, mode: Mode) {
  const row = await db.insurancePolicies.get(id);
  await db.insurancePolicies.delete(id);
  if (row?.isDefault) await db.patients.update(row.patientId, { defaultInsuranceId: null });
  await writeAudit({ entityType: "insurance_policy", entityId: id, action: "insurance_removed", previousValue: row?.payerName ?? null, mode });
}

export async function upsertCivilRegistryRecord(patientId: string, updates: Partial<CivilRegistryRecord>, mode: Mode) {
  const existing = await db.civilRegistryRecords.where("patientId").equals(patientId).first();
  if (existing) {
    await db.civilRegistryRecords.update(existing.id, { ...updates, updatedAt: Date.now() });
    await writeAudit({ entityType: "civil_registry", entityId: existing.id, action: "civil_registry_updated", newValue: updates.sijilNumber ?? updates.daira ?? null, mode });
    return existing.id;
  }
  const row: CivilRegistryRecord = {
    id: uuid(),
    patientId,
    sijilNumber: updates.sijilNumber ?? null,
    sahifaNumber: updates.sahifaNumber ?? null,
    daira: updates.daira ?? null,
    registryCountry: updates.registryCountry ?? null,
    registryGovernorate: updates.registryGovernorate ?? null,
    registryDistrict: updates.registryDistrict ?? null,
    registryLocality: updates.registryLocality ?? null,
    registryNotes: updates.registryNotes ?? null,
    updatedAt: Date.now(),
  };
  await db.civilRegistryRecords.add(row);
  await writeAudit({ entityType: "civil_registry", entityId: row.id, action: "civil_registry_created", newValue: row.sijilNumber ?? row.daira, mode });
  return row.id;
}

export async function upsertEmploymentRecord(patientId: string, updates: Partial<EmploymentRecord>, mode: Mode) {
  const existing = await db.employmentRecords.where("patientId").equals(patientId).first();
  if (existing) {
    await db.employmentRecords.update(existing.id, { ...updates, updatedAt: Date.now() });
    await writeAudit({ entityType: "employment", entityId: existing.id, action: "employment_updated", newValue: updates.occupation ?? updates.employer ?? null, mode });
    return existing.id;
  }
  const row: EmploymentRecord = {
    id: uuid(),
    patientId,
    occupation: updates.occupation ?? null,
    employmentStatus: updates.employmentStatus ?? null,
    employer: updates.employer ?? null,
    jobTitle: updates.jobTitle ?? null,
    workPhone: updates.workPhone ?? null,
    workAddress: updates.workAddress ?? null,
    industry: updates.industry ?? null,
    notes: updates.notes ?? null,
    updatedAt: Date.now(),
  };
  await db.employmentRecords.add(row);
  await writeAudit({ entityType: "employment", entityId: row.id, action: "employment_created", newValue: row.occupation ?? row.employer, mode });
  return row.id;
}

export async function upsertMilitaryRecord(patientId: string, updates: Partial<MilitaryRecord>, mode: Mode) {
  const existing = await db.militaryRecords.where("patientId").equals(patientId).first();
  if (existing) {
    await db.militaryRecords.update(existing.id, { ...updates, updatedAt: Date.now() });
    await writeAudit({ entityType: "military_record", entityId: existing.id, action: "military_updated", newValue: updates.institution ?? updates.serviceNumber ?? null, mode });
    return existing.id;
  }
  const row: MilitaryRecord = {
    id: uuid(),
    patientId,
    enabled: updates.enabled ?? false,
    institution: updates.institution ?? null,
    section: updates.section ?? null,
    positionOrRank: updates.positionOrRank ?? null,
    serviceNumber: updates.serviceNumber ?? null,
    zone: updates.zone ?? null,
    notes: updates.notes ?? null,
    updatedAt: Date.now(),
  };
  await db.militaryRecords.add(row);
  await writeAudit({ entityType: "military_record", entityId: row.id, action: "military_created", newValue: row.institution ?? null, mode });
  return row.id;
}

export async function addPendingCase(input: Omit<PendingCase, "id" | "createdAt"> & { createdAt?: number }, mode: Mode) {
  const row: PendingCase = { ...input, id: uuid(), createdAt: input.createdAt ?? Date.now() };
  await db.pendingCases.add(row);
  await writeAudit({ entityType: "pending_case", entityId: row.id, action: "pending_case_added", newValue: row.pendingStatus, mode });
  return row;
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

// --- First-class clinical domain CRUD (Dexie v5) ---------------------------
// Each domain exposes add/update/remove. Every mutation writes an AuditEvent,
// mirroring the VitalsSet convention. Allergy records additionally keep the
// Encounter.allergies string[] in sync so the always-on chart banner + seed
// keep working.

export async function addMedication(
  input: Omit<MedicationRecord, "id" | "createdAt">,
  mode: Mode,
) {
  const row: MedicationRecord = { ...input, id: uuid(), createdAt: Date.now() };
  await db.medications.add(row);
  await writeAudit({ entityType: "medication_record", entityId: row.id, action: "medication_added", newValue: row.name, actor: row.prescriber, mode });
  return row;
}

export async function updateMedication(id: string, updates: Partial<MedicationRecord>, mode: Mode) {
  await db.medications.update(id, updates);
  await writeAudit({ entityType: "medication_record", entityId: id, action: "medication_updated", newValue: updates.name ?? null, mode });
}

export async function removeMedication(id: string, mode: Mode) {
  const row = await db.medications.get(id);
  await db.medications.delete(id);
  await writeAudit({ entityType: "medication_record", entityId: id, action: "medication_removed", previousValue: row?.name ?? null, mode });
}

export async function addAllergyRecord(
  input: Omit<AllergyRecord, "id" | "notedAt"> & { notedAt?: number },
  mode: Mode,
) {
  const row: AllergyRecord = { ...input, id: uuid(), notedAt: input.notedAt ?? Date.now() };
  await db.allergyRecords.add(row);
  const encounter = await db.encounters.get(row.encounterId);
  if (encounter && !encounter.allergies.includes(row.substance)) {
    await db.encounters.update(row.encounterId, { allergies: [...encounter.allergies, row.substance] });
  }
  await writeAudit({ entityType: "allergy_record", entityId: row.id, action: "allergy_added", newValue: row.substance, actor: row.actor, mode });
  return row;
}

export async function updateAllergyRecord(id: string, updates: Partial<AllergyRecord>, mode: Mode) {
  const before = await db.allergyRecords.get(id);
  await db.allergyRecords.update(id, updates);
  if (before && updates.substance && updates.substance !== before.substance) {
    const encounter = await db.encounters.get(before.encounterId);
    if (encounter) {
      const allergies = encounter.allergies.map((a) => (a === before.substance ? updates.substance! : a));
      await db.encounters.update(before.encounterId, { allergies });
    }
  }
  await writeAudit({ entityType: "allergy_record", entityId: id, action: "allergy_updated", newValue: updates.substance ?? null, mode });
}

export async function removeAllergyRecord(id: string, mode: Mode) {
  const row = await db.allergyRecords.get(id);
  await db.allergyRecords.delete(id);
  if (row) {
    const encounter = await db.encounters.get(row.encounterId);
    if (encounter) {
      await db.encounters.update(row.encounterId, { allergies: encounter.allergies.filter((a) => a !== row.substance) });
    }
  }
  await writeAudit({ entityType: "allergy_record", entityId: id, action: "allergy_removed", previousValue: row?.substance ?? null, mode });
}

export async function addCondition(input: Omit<ConditionRecord, "id" | "createdAt">, mode: Mode) {
  const row: ConditionRecord = { ...input, id: uuid(), createdAt: Date.now() };
  await db.conditions.add(row);
  await writeAudit({ entityType: "condition", entityId: row.id, action: "condition_added", newValue: row.name, mode });
  return row;
}

export async function updateCondition(id: string, updates: Partial<ConditionRecord>, mode: Mode) {
  await db.conditions.update(id, updates);
  await writeAudit({ entityType: "condition", entityId: id, action: "condition_updated", newValue: updates.name ?? null, mode });
}

export async function removeCondition(id: string, mode: Mode) {
  const row = await db.conditions.get(id);
  await db.conditions.delete(id);
  await writeAudit({ entityType: "condition", entityId: id, action: "condition_removed", previousValue: row?.name ?? null, mode });
}

export async function addOrderRecord(
  input: Omit<OrderRecord, "id" | "orderedAt"> & { orderedAt?: number },
  mode: Mode,
) {
  const orderedAt = input.orderedAt ?? Date.now();
  const row: OrderRecord = {
    ...input,
    id: uuid(),
    orderedAt,
    statusUpdatedAt: input.statusUpdatedAt ?? orderedAt,
    statusUpdatedBy: input.statusUpdatedBy ?? input.actor,
  };
  await db.orderRecords.add(row);
  await writeAudit({ entityType: "order_record", entityId: row.id, action: "order_added", newValue: row.name, actor: row.actor, patientId: row.patientId, encounterId: row.encounterId, mode });
  return row;
}

export async function updateOrderRecord(id: string, updates: Partial<OrderRecord>, mode: Mode) {
  const before = await db.orderRecords.get(id);
  if (!before) throw new Error("Order not found.");
  if (updates.status && updates.status !== before.status) {
    throw new Error("Use the Orders workflow action to change order status.");
  }
  await db.orderRecords.update(id, updates);
  await writeAudit({ entityType: "order_record", entityId: id, action: "order_updated", newValue: updates.name ?? null, actor: updates.actor ?? before.actor, patientId: before.patientId, encounterId: before.encounterId, mode });
}

export async function transitionOrderRecordStatus(
  id: string,
  status: OrderStatus,
  actor: string,
  mode: Mode,
  reason?: string,
) {
  const before = await db.orderRecords.get(id);
  if (!before) throw new Error("Order not found.");
  if (before.status === status) return before;
  if (!canTransitionOrderStatus(before.status, status)) {
    throw new Error(`Order cannot move from ${before.status.replace(/_/g, " ")} to ${status.replace(/_/g, " ")}.`);
  }

  const now = Date.now();
  const transitionReason = reason?.trim() || null;
  if (status === "cancelled" && !transitionReason) {
    throw new Error("A cancellation reason is required.");
  }
  const updates: Partial<OrderRecord> = {
    status,
    statusUpdatedAt: now,
    statusUpdatedBy: actor,
  };
  if (status === "cancelled") {
    updates.cancelledAt = now;
    updates.cancellationReason = transitionReason;
  }

  await db.orderRecords.update(id, updates);
  await writeAudit({
    entityType: "order_record",
    entityId: id,
    action: "order_status_transition",
    previousValue: before.status,
    newValue: status,
    actor,
    patientId: before.patientId,
    encounterId: before.encounterId,
    reason: transitionReason,
    mode,
  });
  return { ...before, ...updates };
}

export async function removeOrderRecord(id: string, mode: Mode) {
  const row = await db.orderRecords.get(id);
  await db.orderRecords.delete(id);
  await writeAudit({ entityType: "order_record", entityId: id, action: "order_removed", previousValue: row?.name ?? null, mode });
}

export async function addResultRecord(
  input: Omit<ResultRecord, "id" | "resultedAt"> & { resultedAt?: number },
  mode: Mode,
) {
  const row: ResultRecord = {
    ...input,
    id: uuid(),
    resultedAt: input.resultedAt ?? Date.now(),
    status: input.status ?? "final",
    reviewStatus: input.reviewStatus ?? "unreviewed",
  };
  await db.resultRecords.add(row);
  await writeAudit({ entityType: "result_record", entityId: row.id, action: "result_added", newValue: row.name, actor: row.verifiedBy, patientId: row.patientId, encounterId: row.encounterId, mode });
  if (row.orderId) {
    const order = await db.orderRecords.get(row.orderId);
    if (order?.status === "completed") {
      await transitionOrderRecordStatus(order.id, "result_available", row.verifiedBy ?? "Results service", mode, "Linked result became available");
    }
  }
  return row;
}

export async function updateResultRecord(id: string, updates: Partial<ResultRecord>, mode: Mode) {
  const before = await db.resultRecords.get(id);
  if (!before) throw new Error("Result not found.");
  if (updates.reviewStatus && updates.reviewStatus !== resultReviewStatus(before)) {
    throw new Error("Use an explicit Results workflow action to change review status.");
  }

  const clinicalContentChanged = ["name", "value", "unit", "referenceRange", "flag", "status"].some(
    (key) => key in updates && updates[key as keyof ResultRecord] !== before[key as keyof ResultRecord],
  );
  const nextFlag = updates.flag ?? before.flag;
  const safeUpdates: Partial<ResultRecord> = { ...updates };
  if (clinicalContentChanged && ["reviewed", "acknowledged"].includes(resultReviewStatus(before))) {
    safeUpdates.reviewStatus = nextFlag === "critical" ? "action_required" : "unreviewed";
    safeUpdates.reviewedAt = null;
    safeUpdates.reviewedBy = null;
    safeUpdates.acknowledgedAt = null;
    safeUpdates.acknowledgedBy = null;
    safeUpdates.criticalActionTaken = null;
  } else if (updates.flag === "critical" && before.flag !== "critical") {
    safeUpdates.reviewStatus = "action_required";
  }

  await db.resultRecords.update(id, safeUpdates);
  await writeAudit({
    entityType: "result_record",
    entityId: id,
    action: clinicalContentChanged ? "result_corrected" : "result_updated",
    previousValue: before.value,
    newValue: safeUpdates.value ?? safeUpdates.status ?? safeUpdates.name ?? null,
    actor: safeUpdates.verifiedBy ?? before.verifiedBy,
    patientId: before.patientId,
    encounterId: before.encounterId,
    reason: clinicalContentChanged && safeUpdates.reviewStatus ? "Clinical content changed; review required again" : null,
    mode,
  });
}

export async function reviewResultRecord(id: string, actor: string, mode: Mode) {
  const before = await db.resultRecords.get(id);
  if (!before) throw new Error("Result not found.");
  if (before.flag === "critical") {
    throw new Error("Critical results require acknowledgement with the clinical action taken.");
  }
  if (resultReviewStatus(before) === "acknowledged" || resultReviewStatus(before) === "reviewed") return before;

  const now = Date.now();
  const updates: Partial<ResultRecord> = {
    reviewStatus: "reviewed",
    reviewedAt: now,
    reviewedBy: actor,
  };
  await db.resultRecords.update(id, updates);
  await writeAudit({
    entityType: "result_record",
    entityId: id,
    action: "result_reviewed",
    previousValue: resultReviewStatus(before),
    newValue: "reviewed",
    actor,
    patientId: before.patientId,
    encounterId: before.encounterId,
    mode,
  });

  if (before.orderId) {
    const order = await db.orderRecords.get(before.orderId);
    if (order?.status === "completed") {
      await transitionOrderRecordStatus(order.id, "result_available", actor, mode, "Linked result available");
      await transitionOrderRecordStatus(order.id, "reviewed", actor, mode, "Linked result reviewed");
    } else if (order?.status === "result_available") {
      await transitionOrderRecordStatus(order.id, "reviewed", actor, mode, "Linked result reviewed");
    }
  }
  return { ...before, ...updates };
}

export async function acknowledgeCriticalResultRecord(
  id: string,
  actor: string,
  actionTaken: string,
  mode: Mode,
) {
  const before = await db.resultRecords.get(id);
  if (!before) throw new Error("Result not found.");
  if (before.flag !== "critical") throw new Error("Only critical results require critical acknowledgement.");
  if (!actionTaken.trim()) throw new Error("Record the clinical action taken before acknowledging this critical result.");
  if (resultReviewStatus(before) === "acknowledged") return before;

  const now = Date.now();
  const updates: Partial<ResultRecord> = {
    reviewStatus: "acknowledged",
    reviewedAt: before.reviewedAt ?? now,
    reviewedBy: before.reviewedBy ?? actor,
    acknowledgedAt: now,
    acknowledgedBy: actor,
    criticalActionTaken: actionTaken.trim(),
  };
  await db.resultRecords.update(id, updates);
  await writeAudit({
    entityType: "result_record",
    entityId: id,
    action: "critical_result_acknowledged",
    previousValue: resultReviewStatus(before),
    newValue: `acknowledged: ${actionTaken.trim()}`,
    actor,
    patientId: before.patientId,
    encounterId: before.encounterId,
    reason: actionTaken.trim(),
    mode,
  });
  if (before.orderId) {
    const order = await db.orderRecords.get(before.orderId);
    if (order?.status === "completed") {
      await transitionOrderRecordStatus(order.id, "result_available", actor, mode, "Linked critical result available");
      await transitionOrderRecordStatus(order.id, "reviewed", actor, mode, "Linked critical result acknowledged");
    } else if (order?.status === "result_available") {
      await transitionOrderRecordStatus(order.id, "reviewed", actor, mode, "Linked critical result acknowledged");
    }
  }
  return { ...before, ...updates };
}

export async function removeResultRecord(id: string, mode: Mode) {
  const row = await db.resultRecords.get(id);
  await db.resultRecords.delete(id);
  await writeAudit({ entityType: "result_record", entityId: id, action: "result_removed", previousValue: row?.name ?? null, mode });
}

export async function addImmunization(input: Omit<ImmunizationRecord, "id" | "createdAt">, mode: Mode) {
  const row: ImmunizationRecord = { ...input, id: uuid(), createdAt: Date.now() };
  await db.immunizations.add(row);
  await writeAudit({ entityType: "immunization", entityId: row.id, action: "immunization_added", newValue: row.vaccine, actor: row.provider, mode });
  return row;
}

export async function updateImmunization(id: string, updates: Partial<ImmunizationRecord>, mode: Mode) {
  await db.immunizations.update(id, updates);
  await writeAudit({ entityType: "immunization", entityId: id, action: "immunization_updated", newValue: updates.vaccine ?? null, mode });
}

export async function removeImmunization(id: string, mode: Mode) {
  const row = await db.immunizations.get(id);
  await db.immunizations.delete(id);
  await writeAudit({ entityType: "immunization", entityId: id, action: "immunization_removed", previousValue: row?.vaccine ?? null, mode });
}

export async function addProcedure(input: Omit<ProcedureRecord, "id" | "createdAt">, mode: Mode) {
  const row: ProcedureRecord = { ...input, id: uuid(), createdAt: Date.now() };
  await db.procedures.add(row);
  await writeAudit({ entityType: "procedure", entityId: row.id, action: "procedure_added", newValue: row.name, actor: row.operator, mode });
  return row;
}

export async function updateProcedure(id: string, updates: Partial<ProcedureRecord>, mode: Mode) {
  await db.procedures.update(id, updates);
  await writeAudit({ entityType: "procedure", entityId: id, action: "procedure_updated", newValue: updates.name ?? null, mode });
}

export async function removeProcedure(id: string, mode: Mode) {
  const row = await db.procedures.get(id);
  await db.procedures.delete(id);
  await writeAudit({ entityType: "procedure", entityId: id, action: "procedure_removed", previousValue: row?.name ?? null, mode });
}

export async function addProgram(input: Omit<ProgramRecord, "id" | "createdAt">, mode: Mode) {
  const row: ProgramRecord = { ...input, id: uuid(), createdAt: Date.now() };
  await db.programs.add(row);
  await writeAudit({ entityType: "program", entityId: row.id, action: "program_added", newValue: row.name, actor: row.coordinator, mode });
  return row;
}

export async function updateProgram(id: string, updates: Partial<ProgramRecord>, mode: Mode) {
  await db.programs.update(id, updates);
  await writeAudit({ entityType: "program", entityId: id, action: "program_updated", newValue: updates.name ?? updates.status ?? null, mode });
}

export async function removeProgram(id: string, mode: Mode) {
  const row = await db.programs.get(id);
  await db.programs.delete(id);
  await writeAudit({ entityType: "program", entityId: id, action: "program_removed", previousValue: row?.name ?? null, mode });
}

export async function addBillingItem(input: Omit<BillingItem, "id" | "createdAt">, mode: Mode) {
  const row: BillingItem = { ...input, id: uuid(), createdAt: Date.now() };
  await db.billingItems.add(row);
  await writeAudit({ entityType: "billing_item", entityId: row.id, action: "billing_added", newValue: row.description, mode });
  return row;
}

export async function updateBillingItem(id: string, updates: Partial<BillingItem>, mode: Mode) {
  await db.billingItems.update(id, updates);
  await writeAudit({ entityType: "billing_item", entityId: id, action: "billing_updated", newValue: updates.status ?? updates.description ?? null, mode });
}

export async function removeBillingItem(id: string, mode: Mode) {
  const row = await db.billingItems.get(id);
  await db.billingItems.delete(id);
  await writeAudit({ entityType: "billing_item", entityId: id, action: "billing_removed", previousValue: row?.description ?? null, mode });
}

export async function addAttachment(
  input: Omit<Attachment, "id" | "uploadedAt"> & { uploadedAt?: number },
  mode: Mode,
) {
  const row: Attachment = { ...input, id: uuid(), uploadedAt: input.uploadedAt ?? Date.now() };
  await db.attachments.add(row);
  await writeAudit({ entityType: "attachment", entityId: row.id, action: "attachment_added", newValue: row.title, actor: row.uploadedBy, mode });
  return row;
}

export async function updateAttachment(id: string, updates: Partial<Attachment>, mode: Mode) {
  await db.attachments.update(id, updates);
  await writeAudit({ entityType: "attachment", entityId: id, action: "attachment_updated", newValue: updates.title ?? null, mode });
}

export async function removeAttachment(id: string, mode: Mode) {
  const row = await db.attachments.get(id);
  await db.attachments.delete(id);
  await writeAudit({ entityType: "attachment", entityId: id, action: "attachment_removed", previousValue: row?.title ?? null, mode });
}
