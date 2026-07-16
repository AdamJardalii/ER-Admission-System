import type {
  AuditEvent,
  Bed,
  ClinicalEvent,
  Encounter,
  EncounterEvent,
  EncounterStatus,
  MedicationRecord,
  Mode,
  OrderRecord,
  OrderStatus,
  Patient,
  PrototypeNotification,
  ResultRecord,
  TriageAssessment,
} from "../../types";
import type { PrototypeConfiguration } from "../prototypeConfiguration";

export interface TransitionMetadata {
  reason?: string;
  actor?: string;
  mode?: Mode;
  metadata?: Record<string, unknown>;
}

export interface PatientRepository {
  list(): Promise<Patient[]>;
  findById(id: string): Promise<Patient | null>;
}

export interface EncounterRepository {
  listActive(): Promise<Encounter[]>;
  findById(id: string): Promise<Encounter | null>;
  create(input: { patientId: string; chiefComplaint?: string | null }): Promise<Encounter>;
  transition(encounterId: string, toStatus: EncounterStatus, metadata?: TransitionMetadata): Promise<Encounter>;
  listEvents(encounterId: string): Promise<EncounterEvent[]>;
}

export interface TriageRepository {
  listForEncounter(encounterId: string): Promise<TriageAssessment[]>;
  latestForEncounter(encounterId: string): Promise<TriageAssessment | null>;
}

export interface BedRepository {
  list(): Promise<Bed[]>;
  findById(id: string): Promise<Bed | null>;
}

export interface OrderRepository {
  listForEncounter(encounterId: string): Promise<OrderRecord[]>;
  findById(id: string): Promise<OrderRecord | null>;
  create(input: Omit<OrderRecord, "id" | "orderedAt"> & { orderedAt?: number }, mode?: Mode): Promise<OrderRecord>;
  transition(id: string, status: OrderStatus, reason?: string, mode?: Mode): Promise<OrderRecord>;
}

export interface ResultRepository {
  listForEncounter(encounterId: string): Promise<ResultRecord[]>;
  findById(id: string): Promise<ResultRecord | null>;
  create(input: Omit<ResultRecord, "id" | "resultedAt"> & { resultedAt?: number }, mode?: Mode): Promise<ResultRecord>;
}

export interface MedicationRepository {
  listForPatient(patientId: string): Promise<MedicationRecord[]>;
  findById(id: string): Promise<MedicationRecord | null>;
  create(input: Omit<MedicationRecord, "id" | "createdAt">, mode?: Mode): Promise<MedicationRecord>;
}

export interface NoteRepository {
  listForEncounter(encounterId: string): Promise<ClinicalEvent[]>;
}

export interface DispositionRepository {
  listPending(): Promise<Encounter[]>;
  transition(encounterId: string, toStatus: EncounterStatus, metadata?: TransitionMetadata): Promise<Encounter>;
}

export interface NotificationRepository {
  list(): Promise<PrototypeNotification[]>;
  create(input: Omit<PrototypeNotification, "id" | "createdAt" | "readAt" | "acknowledgedAt" | "acknowledgedBy">): Promise<PrototypeNotification>;
  markRead(id: string): Promise<PrototypeNotification>;
  acknowledge(id: string): Promise<PrototypeNotification>;
  clear(id: string): Promise<void>;
}

export interface AuditRepository {
  listForEntity(entityId: string): Promise<AuditEvent[]>;
  listForEncounter(encounterId: string): Promise<AuditEvent[]>;
}

export interface ConfigurationRepository {
  load(): Promise<PrototypeConfiguration>;
  save(configuration: PrototypeConfiguration): Promise<PrototypeConfiguration>;
  reset(): Promise<PrototypeConfiguration>;
}
