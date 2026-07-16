import Dexie, { type EntityTable } from "dexie";
import type {
  Patient,
  Encounter,
  TriageAssessment,
  LocationAssignment,
  ClinicalEvent,
  AuditEvent,
  PatientIdentifier,
  RelatedPerson,
  InsurancePolicy,
  CivilRegistryRecord,
  EmploymentRecord,
  MilitaryRecord,
  PendingCase,
  VitalsSet,
  ReferenceRange,
  VitalsSchedule,
  MergeRecord,
  StateTransition,
  Incident,
  ReconciliationItem,
  Bed,
  Zone,
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
  PrototypeNotification,
} from "../types";

export const db = new Dexie("er-system") as Dexie & {
  patients: EntityTable<Patient, "id">;
  encounters: EntityTable<Encounter, "id">;
  triageAssessments: EntityTable<TriageAssessment, "id">;
  locationAssignments: EntityTable<LocationAssignment, "id">;
  clinicalEvents: EntityTable<ClinicalEvent, "id">;
  auditEvents: EntityTable<AuditEvent, "id">;
  patientIdentifiers: EntityTable<PatientIdentifier, "id">;
  relatedPersons: EntityTable<RelatedPerson, "id">;
  insurancePolicies: EntityTable<InsurancePolicy, "id">;
  civilRegistryRecords: EntityTable<CivilRegistryRecord, "id">;
  employmentRecords: EntityTable<EmploymentRecord, "id">;
  militaryRecords: EntityTable<MilitaryRecord, "id">;
  pendingCases: EntityTable<PendingCase, "id">;
  vitalsSets: EntityTable<VitalsSet, "id">;
  referenceRanges: EntityTable<ReferenceRange, "id">;
  vitalsSchedules: EntityTable<VitalsSchedule, "id">;
  mergeRecords: EntityTable<MergeRecord, "id">;
  stateTransitions: EntityTable<StateTransition, "id">;
  incidents: EntityTable<Incident, "id">;
  reconciliationItems: EntityTable<ReconciliationItem, "id">;
  beds: EntityTable<Bed, "id">;
  zones: EntityTable<Zone, "id">;
  medications: EntityTable<MedicationRecord, "id">;
  allergyRecords: EntityTable<AllergyRecord, "id">;
  conditions: EntityTable<ConditionRecord, "id">;
  orderRecords: EntityTable<OrderRecord, "id">;
  resultRecords: EntityTable<ResultRecord, "id">;
  immunizations: EntityTable<ImmunizationRecord, "id">;
  procedures: EntityTable<ProcedureRecord, "id">;
  programs: EntityTable<ProgramRecord, "id">;
  billingItems: EntityTable<BillingItem, "id">;
  attachments: EntityTable<Attachment, "id">;
  prototypeNotifications: EntityTable<PrototypeNotification, "id">;
};

db.version(1).stores({
  patients: "id, displayNumber, identityStatus, createdAt",
  encounters:
    "id, patientId, incidentId, modeAtCreation, state, arrivedAt",
  triageAssessments: "id, encounterId, performedAt",
  locationAssignments: "id, encounterId, zone, assignedAt",
  clinicalEvents: "id, encounterId, type, recordedAt",
  auditEvents: "id, entityType, entityId, action, timestamp",
  incidents: "id, activatedAt",
  reconciliationItems: "id, encounterId, status, issueType",
  beds: "id, zone, encounterId",
  zones: "id, order",
});

db.version(2).stores({
  patients: "id, displayNumber, mrn, identityStatus, createdAt",
  encounters: "id, caseNumber, patientId, incidentId, modeAtCreation, state, arrivedAt",
});

db.version(3).stores({
  patients: "id, displayNumber, mrn, identityStatus, registrationComplete, mergedIntoPatientId, createdAt",
  patientIdentifiers: "id, patientId, type, value",
  vitalsSets: "id, encounterId, patientId, recordedAt, news2, source",
  referenceRanges: "id, parameter",
  vitalsSchedules: "id, context, level",
  mergeRecords: "id, survivorPatientId, sourcePatientId, mergedAt, undoneAt",
});

db.version(4).stores({
  encounters: "id, caseNumber, patientId, incidentId, modeAtCreation, pathway, state, arrivedAt",
  vitalsSets: "id, encounterId, patientId, recordedAt, news2, source, voidedAt",
  stateTransitions: "id, encounterId, timestamp, newState",
});

db.version(5).stores({
  medications: "id, patientId, encounterId, status, createdAt",
  allergyRecords: "id, encounterId, patientId, status, notedAt",
  conditions: "id, patientId, encounterId, status, createdAt",
  orderRecords: "id, encounterId, patientId, orderType, status, orderedAt",
  resultRecords: "id, encounterId, patientId, orderId, flag, resultedAt",
  immunizations: "id, patientId, encounterId, status, createdAt",
  procedures: "id, encounterId, patientId, performedAt, createdAt",
  programs: "id, patientId, encounterId, status, createdAt",
  billingItems: "id, encounterId, patientId, status, createdAt",
  attachments: "id, encounterId, patientId, category, uploadedAt",
});

db.version(6).stores({
  patients: "id, displayNumber, mrn, identityStatus, registrationComplete, mergedIntoPatientId, createdAt",
  patientIdentifiers: "id, patientId, type, value, isPrimary, expiryDate",
  relatedPersons: "id, patientId, relationship, isEmergencyContact, isNextOfKin, isSpouse, isLegalGuardian, contactPriority",
  insurancePolicies: "id, patientId, payerName, policyNumber, membershipNumber, isDefault, expiryDate",
  civilRegistryRecords: "id, patientId, sijilNumber, sahifaNumber",
  employmentRecords: "id, patientId, employmentStatus",
  militaryRecords: "id, patientId, enabled, serviceNumber",
  pendingCases: "id, patientId, encounterId, requestDate, pendingStatus, responsibleDepartment",
});

db.version(7).stores({
  encounters: "id, caseNumber, patientId, incidentId, modeAtCreation, pathway, state, workflowStatus, arrivedAt",
  stateTransitions: "id, encounterId, timestamp, newState, workflowToStatus, actorId",
  auditEvents: "id, entityType, entityId, action, timestamp, patientId, encounterId, actorId",
  prototypeNotifications: "id, type, severity, patientId, encounterId, createdAt, readAt, acknowledgedAt",
});
