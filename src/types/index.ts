export type Mode = "normal" | "catastrophe";
export type EncounterPathway = "standard" | "fast_track" | "critical" | "catastrophe";

export type IdentityStatus = "unknown" | "provisional" | "confirmed" | "pending_verification" | "merged";

export type Sex = "male" | "female" | "unknown";
export type AgeBand = "0-1" | "1-5" | "5-12" | "13-17" | "18-30" | "31-50" | "51-70" | "70+";

export type ArrivalMethod = "walk_in" | "ambulance" | "transfer" | "police" | "other";

export type EncounterState =
  | "arrived"
  | "registered"
  | "triaged"
  | "waiting"
  | "assigned"
  | "in_assessment"
  | "orders_pending"
  | "in_treatment"
  | "reassessment_required"
  | "observation"
  | "admission_pending"
  | "waiting_for_specialty_acceptance"
  | "waiting_for_bed"
  | "waiting_for_transport"
  | "transfer_pending"
  | "discharge_pending"
  | "disposition_pending"
  | "disposition_decided"
  | "fast_track"
  | "resuscitation"
  | "closed"
  | "discharged"
  | "left_without_being_seen"
  | "left_against_medical_advice"
  | "absconded"
  | "died_before_treatment"
  | "transferred_out"
  | "transferred"
  | "deceased"
  | "unknown_status"
  | "identity_pending"
  | "reconciliation_pending";

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

export type OrderType =
  | "laboratory"
  | "imaging"
  | "medication"
  | "procedure"
  | "consultation"
  | "blood_product"
  | "observation"
  | "admission"
  | "transfer"
  | "monitoring"
  | "other";

export type OrderStatus =
  | "draft"
  | "ordered"
  | "acknowledged"
  | "in_progress"
  | "completed"
  | "result_available"
  | "reviewed"
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
  registrationComplete?: boolean;
  duplicateOverride?: boolean;
  catastropheTags?: string[];
  mergedIntoPatientId?: string | null;
  mergedAt?: number | null;
  mergeUndoneAt?: number | null;
  createdAt: number;
}

export type IdentifierType = "mrn" | "national_id" | "catastrophe_tag";

export interface PatientIdentifier {
  id: string;
  patientId: string;
  type: IdentifierType;
  value: string;
  createdAt: number;
}

export interface Encounter {
  id: string;
  caseNumber?: string | null;
  patientId: string;
  incidentId: string | null;
  modeAtCreation: Mode;
  pathway?: EncounterPathway;
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
  assignedNurse?: string | null;
  careTeam?: string[];
  updatedAt?: number | null;
}

export interface StateTransition {
  id: string;
  encounterId: string;
  previousState: EncounterState | null;
  newState: EncounterState;
  reason: string | null;
  actor: string | null;
  device: string | null;
  source: "online" | "offline" | "local";
  timestamp: number;
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
  | "state_transition"
  | "correction"
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

export type Avpu = "Alert" | "Voice" | "Pain" | "Unresponsive";

export interface News2Breakdown {
  respiratoryRate: number;
  spo2: number;
  supplementalO2: number;
  temperature: number;
  systolicBp: number;
  heartRate: number;
  consciousness: number;
}

export interface VitalsSet {
  id: string;
  encounterId: string;
  patientId: string;
  recordedAt: number;
  temperature: number | null;
  heartRate: number | null;
  respiratoryRate: number | null;
  systolicBp: number | null;
  diastolicBp: number | null;
  spo2: number | null;
  supplementalO2: boolean;
  consciousness: Avpu;
  painScore: number | null;
  bloodGlucose: number | null;
  weightKg: number | null;
  heightCm: number | null;
  bmi: number | null;
  gcsEye: number | null;
  gcsVerbal: number | null;
  gcsMotor: number | null;
  gcsTotal: number | null;
  news2: number;
  news2Breakdown: News2Breakdown;
  implausibleFields: string[];
  source: "full" | "triage" | "crisis";
  voidedAt?: number | null;
  voidReason?: string | null;
}

export interface ReferenceRange {
  id: string;
  parameter: string;
  label: string;
  unit: string;
  plausibleMin: number;
  plausibleMax: number;
  normalMin: number | null;
  normalMax: number | null;
  criticalLow: number | null;
  criticalHigh: number | null;
}

export interface VitalsSchedule {
  id: string;
  context: "esi" | "start";
  level: string;
  intervalMinutes: number | null;
  label: string;
}

export interface MergeRecord {
  id: string;
  survivorPatientId: string;
  sourcePatientId: string;
  mergedAt: number;
  undoneAt: number | null;
  selectedValues: Record<string, unknown>;
  movedEncounterIds: string[];
  movedIdentifierIds: string[];
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
  | "possible_duplicate"
  | "registration_completion";

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
