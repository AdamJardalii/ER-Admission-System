export type Mode = "normal" | "catastrophe";
export type EncounterPathway = "standard" | "fast_track" | "critical" | "catastrophe";

export type IdentityStatus = "unknown" | "provisional" | "confirmed" | "pending_verification" | "merged";

export type Sex = "male" | "female" | "unknown";
export type AgeBand = "0-1" | "1-5" | "5-12" | "13-17" | "18-30" | "31-50" | "51-70" | "70+";

export type ArrivalMethod = "walk_in" | "ambulance" | "transfer" | "police" | "other";

export type EncounterStatus =
  | "PRE_ARRIVAL"
  | "ARRIVED"
  | "TRIAGED"
  | "WAITING"
  | "ROOMED"
  | "IN_ASSESSMENT"
  | "AWAITING_RESULTS"
  | "DISPOSITION_PENDING"
  | "ADMIT_REQUESTED"
  | "ACCEPTANCE_PENDING"
  | "BED_ASSIGNED"
  | "BOARDING"
  | "DISCHARGE_PENDING"
  | "TRANSFER_PENDING"
  | "HANDOFF_PENDING"
  | "READY_FOR_DEPARTURE"
  | "DEPARTED_ADMITTED"
  | "DEPARTED_DISCHARGED"
  | "DEPARTED_TRANSFERRED"
  | "LWBS"
  | "AMA"
  | "ELOPED"
  | "DECEASED";

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
  | "treatment"
  | "nursing"
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
  | "scheduled"
  | "specimen_pending"
  | "specimen_collected"
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
  patientType?: "standard" | "unknown" | "trauma" | "visitor" | "staff" | string | null;
  confidentialityLevel?: "normal" | "restricted" | "vip" | string | null;
  title?: string | null;
  secondaryMrn?: string | null;
  name: string | null;
  firstNameEn?: string | null;
  middleNameEn?: string | null;
  lastNameEn?: string | null;
  fourthNameEn?: string | null;
  firstNameAr?: string | null;
  middleNameAr?: string | null;
  lastNameAr?: string | null;
  fourthNameAr?: string | null;
  motherNameEn?: string | null;
  motherNameAr?: string | null;
  maidenName?: string | null;
  spouseNameEn?: string | null;
  spouseNameAr?: string | null;
  dateOfBirth: string | null;
  ageValue?: number | null;
  ageUnit?: "years" | "months" | "days" | null;
  ageCalculated?: boolean;
  sex: Sex | null;
  sexAtBirth?: Sex | null;
  genderIdentity?: string | null;
  phone: string | null;
  mobileSecondary?: string | null;
  homePhone?: string | null;
  workPhone?: string | null;
  fax?: string | null;
  preferredContactMethod?: "mobile" | "home_phone" | "work_phone" | "email" | "sms" | "none" | string | null;
  mayReceiveSms?: boolean;
  mayReceiveEmail?: boolean;
  communicationNotes?: string | null;
  nationalId?: string | null;
  email?: string | null;
  address?: string | null;
  addressCountry?: string | null;
  addressGovernorate?: string | null;
  addressDistrict?: string | null;
  addressCity?: string | null;
  addressVillage?: string | null;
  addressZone?: string | null;
  addressArea?: string | null;
  addressStreet?: string | null;
  addressBuilding?: string | null;
  addressFloor?: string | null;
  addressAdditionalDetails?: string | null;
  city?: string | null;
  placeOfBirthCountry?: string | null;
  placeOfBirthGovernorate?: string | null;
  placeOfBirthDistrict?: string | null;
  placeOfBirthCity?: string | null;
  placeOfBirthVillage?: string | null;
  placeOfBirthLocality?: string | null;
  nationality?: string | null;
  maritalStatus?: string | null;
  preferredLanguage?: string | null;
  emergencyContact?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactPhone?: string | null;
  insurance?: string | null;
  insuranceProvider?: string | null;
  insurancePolicyNumber?: string | null;
  defaultInsuranceId?: string | null;
  bloodGroup?: string | null;
  vip?: boolean;
  deceased?: boolean;
  deceasedDate?: string | null;
  religion?: string | null;
  representativeGuardianName?: string | null;
  knownConditions?: string[];
  currentMedications?: string[];
  photoBlob: Blob | null;
  identityStatus: IdentityStatus;
  estimatedAgeRange: string | null;
  registrationComplete?: boolean;
  duplicateOverride?: boolean;
  catastropheTags?: string[];
  mergedIntoPatientId?: string | null;
  isSynthetic?: boolean;
  mergedAt?: number | null;
  mergeUndoneAt?: number | null;
  createdAt: number;
}

export type IdentifierType = "mrn" | "national_id" | "catastrophe_tag" | "passport" | "civil_card" | "unrwa_card" | "ration_card" | "military_number" | "legacy_mrn" | "other";

export interface PatientIdentifier {
  id: string;
  patientId: string;
  type: IdentifierType;
  value: string;
  issuingCountry?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  isPrimary?: boolean;
  verificationStatus?: "unverified" | "verified" | "rejected" | "expired" | string | null;
  verifiedBy?: string | null;
  verificationDate?: string | null;
  frontImageBlob?: Blob | null;
  backImageBlob?: Blob | null;
  notes?: string | null;
  createdAt: number;
}

export interface RelatedPerson {
  id: string;
  patientId: string;
  fullName: string;
  englishName: string | null;
  arabicName: string | null;
  relationship: string | null;
  mobilePrimary: string | null;
  mobileSecondary: string | null;
  email: string | null;
  address: string | null;
  nationalId: string | null;
  isEmergencyContact: boolean;
  isNextOfKin: boolean;
  isSpouse: boolean;
  isParent: boolean;
  isLegalGuardian: boolean;
  isAuthorizedRepresentative: boolean;
  preferredContactMethod: string | null;
  contactPriority: number | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface InsurancePolicy {
  id: string;
  patientId: string;
  payerId: string | null;
  payerName: string;
  plan: string | null;
  membershipNumber: string | null;
  policyNumber: string | null;
  coverageClass: string | null;
  subscriberRelationship: string | null;
  subscriberName: string | null;
  subscriberId: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  isDefault: boolean;
  approvalRequired: boolean;
  notes: string | null;
  cardImageBlob: Blob | null;
  createdAt: number;
  updatedAt: number;
}

export interface CivilRegistryRecord {
  id: string;
  patientId: string;
  sijilNumber: string | null;
  sahifaNumber: string | null;
  daira: string | null;
  registryCountry: string | null;
  registryGovernorate: string | null;
  registryDistrict: string | null;
  registryLocality: string | null;
  registryNotes: string | null;
  updatedAt: number;
}

export interface EmploymentRecord {
  id: string;
  patientId: string;
  occupation: string | null;
  employmentStatus: string | null;
  employer: string | null;
  jobTitle: string | null;
  workPhone: string | null;
  workAddress: string | null;
  industry: string | null;
  notes: string | null;
  updatedAt: number;
}

export interface MilitaryRecord {
  id: string;
  patientId: string;
  enabled: boolean;
  institution: string | null;
  section: string | null;
  positionOrRank: string | null;
  serviceNumber: string | null;
  zone: string | null;
  notes: string | null;
  updatedAt: number;
}

export interface PendingCase {
  id: string;
  patientId: string;
  encounterId: string | null;
  caseNumber: string;
  requestNumber: string | null;
  requestDate: number;
  requestType: string;
  pendingStatus: "pending_specimen" | "pending_approval" | "pending_insurance" | "pending_consultation" | "pending_admission" | "pending_bed" | "pending_documentation" | string;
  responsibleDepartment: string | null;
  assignedOwner: string | null;
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
  workflowStatus?: EncounterStatus;
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
  workflowFromStatus?: EncounterStatus | null;
  workflowToStatus?: EncounterStatus;
  actorId?: string | null;
  actorName?: string | null;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
}

export interface EncounterEvent {
  id: string;
  encounterId: string;
  fromStatus: EncounterStatus | null;
  toStatus: EncounterStatus;
  actorId: string;
  actorName: string;
  occurredAt: string;
  reason?: string;
  metadata?: Record<string, unknown>;
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
  patientId?: string | null;
  encounterId?: string | null;
  reason?: string | null;
  actorId?: string | null;
  demoRole?: string | null;
  metadata?: Record<string, unknown>;
}

export type PrototypeNotificationSeverity = "info" | "warning" | "critical";

export interface PrototypeNotification {
  id: string;
  type: string;
  severity: PrototypeNotificationSeverity;
  title: string;
  message: string;
  patientId: string | null;
  encounterId: string | null;
  createdAt: number;
  readAt: number | null;
  acknowledgedAt: number | null;
  acknowledgedBy: string | null;
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

// --- First-class clinical domain records (Dexie v5) ------------------------
// Each mirrors the VitalsSet convention: id-keyed, scoped by patientId and/or
// encounterId, with a status/date field for sorting and filtering.

export type MedicationStatus = "active" | "past" | "stopped";

export interface MedicationRecord {
  id: string;
  patientId: string;
  encounterId: string | null;
  name: string;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  status: MedicationStatus;
  startedAt: number | null;
  stoppedAt: number | null;
  prescriber: string | null;
  notes: string | null;
  createdAt: number;
}

export type AllergySeverity = "mild" | "moderate" | "severe";
export type AllergyRecordStatus = "active" | "inactive";

export interface AllergyRecord {
  id: string;
  encounterId: string;
  patientId: string;
  substance: string;
  reaction: string | null;
  severity: AllergySeverity;
  status: AllergyRecordStatus;
  notedAt: number;
  actor: string | null;
}

export type ConditionStatus = "active" | "resolved" | "chronic";

export interface ConditionRecord {
  id: string;
  patientId: string;
  encounterId: string | null;
  name: string;
  category: string | null;
  onsetDate: string | null;
  status: ConditionStatus;
  notes: string | null;
  createdAt: number;
}

export interface OrderRecord {
  id: string;
  encounterId: string;
  patientId: string;
  orderType: OrderType;
  name: string;
  details: string | null;
  priority: "routine" | "urgent" | "stat";
  status: OrderStatus;
  orderedAt: number;
  actor: string | null;
  requestedDepartment?: string | null;
  clinicalIndication?: string | null;
  instructions?: string | null;
  statusUpdatedAt?: number | null;
  statusUpdatedBy?: string | null;
  cancelledAt?: number | null;
  cancellationReason?: string | null;
}

export type ResultFlag = "normal" | "abnormal" | "critical";
export type ResultStatus = "pending" | "preliminary" | "final" | "corrected" | "cancelled";
export type ResultReviewStatus = "unreviewed" | "reviewed" | "acknowledged" | "action_required";

export interface ResultRecord {
  id: string;
  encounterId: string;
  patientId: string;
  orderId: string | null;
  name: string;
  value: string | null;
  unit: string | null;
  referenceRange: string | null;
  flag: ResultFlag;
  resultedAt: number;
  verifiedBy: string | null;
  status?: ResultStatus;
  reviewStatus?: ResultReviewStatus;
  reviewedAt?: number | null;
  reviewedBy?: string | null;
  acknowledgedAt?: number | null;
  acknowledgedBy?: string | null;
  criticalActionTaken?: string | null;
}

export type ImmunizationStatus = "administered" | "due" | "declined";

export interface ImmunizationRecord {
  id: string;
  patientId: string;
  encounterId: string | null;
  vaccine: string;
  dose: string | null;
  date: string | null;
  site: string | null;
  lot: string | null;
  provider: string | null;
  status: ImmunizationStatus;
  createdAt: number;
}

export interface ProcedureRecord {
  id: string;
  encounterId: string;
  patientId: string;
  name: string;
  category: string | null;
  performedAt: number | null;
  operator: string | null;
  site: string | null;
  outcome: string | null;
  notes: string | null;
  createdAt: number;
}

export type ProgramType = "chronic-care" | "screening" | "follow-up" | "other";
export type ProgramStatus = "enrolled" | "active" | "completed" | "discharged";

export interface ProgramRecord {
  id: string;
  patientId: string;
  encounterId: string | null;
  name: string;
  type: ProgramType;
  enrolledAt: number | null;
  status: ProgramStatus;
  coordinator: string | null;
  notes: string | null;
  createdAt: number;
}

export type BillingStatus = "pending" | "billed" | "paid" | "waived";

export interface BillingItem {
  id: string;
  encounterId: string;
  patientId: string;
  code: string | null;
  description: string;
  category: string | null;
  amount: number | null;
  status: BillingStatus;
  createdAt: number;
}

export type AttachmentCategory = "imaging" | "document" | "photo" | "consent" | "other";

export interface Attachment {
  id: string;
  encounterId: string;
  patientId: string;
  title: string;
  category: AttachmentCategory;
  fileName: string | null;
  mimeType: string | null;
  blob: Blob | null;
  uploadedAt: number;
  uploadedBy: string | null;
}

export interface Zone {
  id: string;
  name: string;
  order: number;
}
