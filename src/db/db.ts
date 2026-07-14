import Dexie, { type EntityTable } from "dexie";
import type {
  Patient,
  Encounter,
  TriageAssessment,
  LocationAssignment,
  ClinicalEvent,
  AuditEvent,
  Incident,
  ReconciliationItem,
  Bed,
  Zone,
} from "../types";

export const db = new Dexie("er-system") as Dexie & {
  patients: EntityTable<Patient, "id">;
  encounters: EntityTable<Encounter, "id">;
  triageAssessments: EntityTable<TriageAssessment, "id">;
  locationAssignments: EntityTable<LocationAssignment, "id">;
  clinicalEvents: EntityTable<ClinicalEvent, "id">;
  auditEvents: EntityTable<AuditEvent, "id">;
  incidents: EntityTable<Incident, "id">;
  reconciliationItems: EntityTable<ReconciliationItem, "id">;
  beds: EntityTable<Bed, "id">;
  zones: EntityTable<Zone, "id">;
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
