export type Mode = "normal" | "catastrophe";

export type IdentityStatus = "unknown" | "provisional" | "confirmed";

export type Sex = "male" | "female" | "unknown";

export type ArrivalMethod = "walk_in" | "ambulance" | "transfer" | "police" | "other";

export type EncounterState =
  | "arrived"
  | "registered"
  | "triaged"
  | "waiting"
  | "in_treatment"
  | "observation"
  | "admission_pending"
  | "transfer_pending"
  | "discharge_pending"
  | "disposition_pending"
  | "closed"
  | "left_without_being_seen"
  | "absconded"
  | "died_before_treatment"
  | "transferred_out"
  | "unknown_status";

export type Disposition =
  | "admitted"
  | "icu"
  | "ward"
  | "operating_room"
  | "observation"
  | "discharged"
  | "transferred"
  | "deceased"
  | "left_without_being_seen"
  | "left_against_medical_advice"
  | "absconded"
  | "unknown_status";

export type OrderType = "laboratory" | "imaging" | "medication" | "procedure" | "consultation";

export type OrderStatus =
  | "ordered"
  | "acknowledged"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "rejected"
  | "failed"
  | "patient_refused";

export type EsiLevel = 1 | 2 | 3 | 4 | 5;
export type StartColor = "red" | "yellow" | "green" | "black";
export type TriageLevel = EsiLevel | StartColor;
export type TriageAlgorithm = "esi" | "start";

export interface Patient {
  id: string;
  displayNumber: string;
  mrn?: string | null;
  name: string | null;
  dateOfBirth: string | null;
  sex: Sex | null;
  phone: string | null;
  nationalId?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  nationality?: string | null;
  preferredLanguage?: string | null;
  emergencyContact?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactPhone?: string | null;
  insurance?: string | null;
  insuranceProvider?: string | null;
  insurancePolicyNumber?: string | null;
  bloodGroup?: string | null;
  knownConditions?: string[];
  currentMedications?: string[];
  photoBlob: Blob | null;
  identityStatus: IdentityStatus;
  estimatedAgeRange: string | null;
  createdAt: number;
}

export interface Encounter {
  id: string;
  caseNumber?: string | null;
  patientId: string;
  incidentId: string | null;
  modeAtCreation: Mode;
  arrivedAt: number;
  state: EncounterState;
  disposition: Disposition | null;
  closedAt: number | null;
  chiefComplaint: string | null;
  arrivalMethod?: ArrivalMethod | null;
  referralSource?: string | null;
  allergies: string[];
  currentLocationName: string | null;
  currentZone: string | null;
  currentProvider: string | null;
}

export interface TriageAssessment {
  id: string;
  encounterId: string;
  algorithm: TriageAlgorithm;
  level: TriageLevel;
  performedAt: number;
  note: string | null;
}

export interface LocationAssignment {
  id: string;
  encounterId: string;
  locationName: string;
  zone: string;
  assignedAt: number;
  releasedAt: number | null;
}

export type ClinicalEventType =
  | "vitals"
  | "note"
  | "voice_note"
  | "photo"
  | "assessment"
  | "order"
  | "order_status"
  | "result"
  | "critical_alert"
  | "medication"
  | "treatment"
  | "reassessment"
  | "created"
  | "re_triage"
  | "location"
  | "disposition"
  | "disposition_status"
  | "team";

export interface ClinicalEvent {
  id: string;
  encounterId: string;
  type: ClinicalEventType;
  content: Record<string, unknown> | null;
  attachmentBlob: Blob | null;
  recordedAt: number;
}

export interface AuditEvent {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  previousValue: string | null;
  newValue: string | null;
  timestamp: number;
  mode: Mode;
  actor?: string | null;
}

export interface Incident {
  id: string;
  name: string;
  code: string;
  activatedAt: number;
  deactivatedAt: number | null;
}

export type ReconciliationIssueType =
  | "unknown_identity"
  | "paper_not_linked"
  | "voice_unreviewed"
  | "location_missing"
  | "possible_duplicate";

export type ReconciliationStatus = "pending" | "resolved" | "manual_review";

export interface ReconciliationItem {
  id: string;
  encounterId: string;
  issueType: ReconciliationIssueType;
  status: ReconciliationStatus;
  paperNoteImage: string | null;
  voiceNoteEventId: string | null;
  suggested: {
    identityMatch: string | null;
    estimatedAge: string | null;
    triage: string | null;
    location: string | null;
    extractedNote: string | null;
  };
  createdAt: number;
}

export interface Bed {
  id: string;
  name: string;
  zone: string;
  encounterId: string | null;
}

export interface Zone {
  id: string;
  name: string;
  order: number;
}
