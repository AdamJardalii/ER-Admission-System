import { db } from "../../db/db";
import { uuid } from "../../db/ids";
import {
  addMedication,
  addOrderRecord,
  addResultRecord,
  createEncounterForExistingPatient,
  transitionEncounterWorkflowStatus,
  transitionOrderRecordStatus,
} from "../../db/repo";
import {
  workflowStatusForEncounter,
  workflowStatusFromLegacy,
  isTerminalEncounterStatus,
} from "../../domain/encounterStateMachine";
import { getStoredDemoStaff, resolvePrototypeActor } from "../../domain/prototypeUser";
import {
  loadPrototypeConfiguration,
  resetPrototypeConfiguration,
  savePrototypeConfiguration,
} from "../prototypeConfiguration";
import type {
  AuditRepository,
  BedRepository,
  ConfigurationRepository,
  DispositionRepository,
  EncounterRepository,
  MedicationRepository,
  NoteRepository,
  NotificationRepository,
  OrderRepository,
  PatientRepository,
  ResultRepository,
  TriageRepository,
  TransitionMetadata,
} from "./contracts";
import { withPrototypeRepositoryBehavior } from "./runtime";
import type { Encounter, EncounterEvent, EncounterStatus, Mode, PrototypeNotification } from "../../types";

const activeDispositionStatuses: readonly EncounterStatus[] = [
  "DISPOSITION_PENDING",
  "ADMIT_REQUESTED",
  "ACCEPTANCE_PENDING",
  "BED_ASSIGNED",
  "BOARDING",
  "DISCHARGE_PENDING",
  "TRANSFER_PENDING",
  "HANDOFF_PENDING",
  "READY_FOR_DEPARTURE",
];

function modeFor(encounter: Encounter | undefined, requested?: Mode): Mode {
  return requested ?? encounter?.modeAtCreation ?? "normal";
}

async function transitionEncounter(encounterId: string, toStatus: EncounterStatus, metadata?: TransitionMetadata) {
  const encounter = await db.encounters.get(encounterId);
  const updated = await transitionEncounterWorkflowStatus(encounterId, toStatus, {
    actor: metadata?.actor,
    reason: metadata?.reason,
    metadata: metadata?.metadata,
    mode: modeFor(encounter, metadata?.mode),
  });
  if (!updated) throw new Error("Encounter not found.");
  return updated;
}

export class LocalPatientRepository implements PatientRepository {
  list() {
    return withPrototypeRepositoryBehavior("loading patients", () => db.patients.orderBy("createdAt").reverse().toArray());
  }

  findById(id: string) {
    return withPrototypeRepositoryBehavior("loading the patient", async () => (await db.patients.get(id)) ?? null);
  }
}

export class LocalEncounterRepository implements EncounterRepository {
  listActive() {
    return withPrototypeRepositoryBehavior("loading active encounters", async () => {
      const encounters = await db.encounters.orderBy("arrivedAt").reverse().toArray();
      return encounters.filter((encounter) => !isTerminalEncounterStatus(workflowStatusForEncounter(encounter)));
    });
  }

  findById(id: string) {
    return withPrototypeRepositoryBehavior("loading the encounter", async () => (await db.encounters.get(id)) ?? null);
  }

  create(input: { patientId: string; chiefComplaint?: string | null }) {
    return withPrototypeRepositoryBehavior("creating the encounter", async () => {
      const patient = await db.patients.get(input.patientId);
      if (!patient) throw new Error("Patient not found.");
      return createEncounterForExistingPatient(patient, input.chiefComplaint ?? null);
    });
  }

  transition(encounterId: string, toStatus: EncounterStatus, metadata?: TransitionMetadata) {
    return withPrototypeRepositoryBehavior("updating the encounter workflow", () => transitionEncounter(encounterId, toStatus, metadata));
  }

  listEvents(encounterId: string) {
    return withPrototypeRepositoryBehavior("loading encounter history", async () => {
      const selected = getStoredDemoStaff();
      const rows = await db.stateTransitions.where("encounterId").equals(encounterId).sortBy("timestamp");
      return rows.map<EncounterEvent>((row) => ({
        id: row.id,
        encounterId: row.encounterId,
        fromStatus: row.workflowFromStatus ?? (row.previousState ? workflowStatusFromLegacy(row.previousState) : null),
        toStatus: row.workflowToStatus ?? workflowStatusFromLegacy(row.newState),
        actorId: row.actorId ?? selected.id,
        actorName: row.actorName ?? row.actor ?? selected.name,
        occurredAt: row.occurredAt ?? new Date(row.timestamp).toISOString(),
        reason: row.reason ?? undefined,
        metadata: row.metadata,
      }));
    });
  }
}

export class LocalTriageRepository implements TriageRepository {
  listForEncounter(encounterId: string) {
    return withPrototypeRepositoryBehavior("loading triage history", async () => {
      const rows = await db.triageAssessments.where("encounterId").equals(encounterId).toArray();
      return rows.sort((a, b) => b.performedAt - a.performedAt);
    });
  }

  async latestForEncounter(encounterId: string) {
    const rows = await this.listForEncounter(encounterId);
    return rows[0] ?? null;
  }
}

export class LocalBedRepository implements BedRepository {
  list() {
    return withPrototypeRepositoryBehavior("loading beds", () => db.beds.toArray());
  }

  findById(id: string) {
    return withPrototypeRepositoryBehavior("loading the bed", async () => (await db.beds.get(id)) ?? null);
  }
}

export class LocalOrderRepository implements OrderRepository {
  listForEncounter(encounterId: string) {
    return withPrototypeRepositoryBehavior("loading orders", async () => {
      const rows = await db.orderRecords.where("encounterId").equals(encounterId).toArray();
      return rows.sort((a, b) => b.orderedAt - a.orderedAt);
    });
  }

  findById(id: string) {
    return withPrototypeRepositoryBehavior("loading the order", async () => (await db.orderRecords.get(id)) ?? null);
  }

  create(input: Parameters<typeof addOrderRecord>[0], mode: Mode = "normal") {
    return withPrototypeRepositoryBehavior("creating the order", () => addOrderRecord(input, mode));
  }

  transition(id: string, status: Parameters<typeof transitionOrderRecordStatus>[1], reason?: string, mode: Mode = "normal") {
    return withPrototypeRepositoryBehavior("updating the order", () => {
      const actor = getStoredDemoStaff();
      return transitionOrderRecordStatus(id, status, actor.name, mode, reason);
    });
  }
}

export class LocalResultRepository implements ResultRepository {
  listForEncounter(encounterId: string) {
    return withPrototypeRepositoryBehavior("loading results", async () => {
      const rows = await db.resultRecords.where("encounterId").equals(encounterId).toArray();
      return rows.sort((a, b) => b.resultedAt - a.resultedAt);
    });
  }

  findById(id: string) {
    return withPrototypeRepositoryBehavior("loading the result", async () => (await db.resultRecords.get(id)) ?? null);
  }

  create(input: Parameters<typeof addResultRecord>[0], mode: Mode = "normal") {
    return withPrototypeRepositoryBehavior("creating the result", () => addResultRecord(input, mode));
  }
}

export class LocalMedicationRepository implements MedicationRepository {
  listForPatient(patientId: string) {
    return withPrototypeRepositoryBehavior("loading medications", async () => {
      const rows = await db.medications.where("patientId").equals(patientId).toArray();
      return rows.sort((a, b) => b.createdAt - a.createdAt);
    });
  }

  findById(id: string) {
    return withPrototypeRepositoryBehavior("loading the medication", async () => (await db.medications.get(id)) ?? null);
  }

  create(input: Parameters<typeof addMedication>[0], mode: Mode = "normal") {
    return withPrototypeRepositoryBehavior("creating the medication", () => addMedication(input, mode));
  }
}

export class LocalNoteRepository implements NoteRepository {
  listForEncounter(encounterId: string) {
    return withPrototypeRepositoryBehavior("loading notes", async () => {
      const rows = await db.clinicalEvents.where("encounterId").equals(encounterId).toArray();
      return rows.filter((row) => ["note", "voice_note"].includes(row.type)).sort((a, b) => b.recordedAt - a.recordedAt);
    });
  }
}

export class LocalDispositionRepository implements DispositionRepository {
  listPending() {
    return withPrototypeRepositoryBehavior("loading disposition work", async () => {
      const encounters = await db.encounters.toArray();
      return encounters.filter((encounter) => activeDispositionStatuses.includes(workflowStatusForEncounter(encounter)));
    });
  }

  transition(encounterId: string, toStatus: EncounterStatus, metadata?: TransitionMetadata) {
    return withPrototypeRepositoryBehavior("updating disposition", () => transitionEncounter(encounterId, toStatus, metadata));
  }
}

export class LocalNotificationRepository implements NotificationRepository {
  list() {
    return withPrototypeRepositoryBehavior("loading notifications", () => db.prototypeNotifications.orderBy("createdAt").reverse().toArray());
  }

  create(input: Omit<PrototypeNotification, "id" | "createdAt" | "readAt" | "acknowledgedAt" | "acknowledgedBy">) {
    return withPrototypeRepositoryBehavior("creating the notification", async () => {
      const row: PrototypeNotification = {
        ...input,
        id: uuid(),
        createdAt: Date.now(),
        readAt: null,
        acknowledgedAt: null,
        acknowledgedBy: null,
      };
      await db.prototypeNotifications.add(row);
      return row;
    });
  }

  markRead(id: string) {
    return withPrototypeRepositoryBehavior("marking the notification read", async () => {
      const row = await db.prototypeNotifications.get(id);
      if (!row) throw new Error("Notification not found.");
      const updated = { ...row, readAt: row.readAt ?? Date.now() };
      await db.prototypeNotifications.put(updated);
      return updated;
    });
  }

  acknowledge(id: string) {
    return withPrototypeRepositoryBehavior("acknowledging the notification", async () => {
      const row = await db.prototypeNotifications.get(id);
      if (!row) throw new Error("Notification not found.");
      const actor = resolvePrototypeActor();
      const now = Date.now();
      const updated = {
        ...row,
        readAt: row.readAt ?? now,
        acknowledgedAt: now,
        acknowledgedBy: actor.actorName,
      };
      await db.prototypeNotifications.put(updated);
      return updated;
    });
  }

  clear(id: string) {
    return withPrototypeRepositoryBehavior("clearing the demo notification", () => db.prototypeNotifications.delete(id));
  }
}

export class LocalAuditRepository implements AuditRepository {
  listForEntity(entityId: string) {
    return withPrototypeRepositoryBehavior("loading audit history", async () => {
      const rows = await db.auditEvents.where("entityId").equals(entityId).toArray();
      return rows.sort((a, b) => b.timestamp - a.timestamp);
    });
  }

  listForEncounter(encounterId: string) {
    return withPrototypeRepositoryBehavior("loading encounter audit history", async () => {
      const rows = await db.auditEvents.where("encounterId").equals(encounterId).toArray();
      return rows.sort((a, b) => b.timestamp - a.timestamp);
    });
  }
}

export class LocalConfigurationRepository implements ConfigurationRepository {
  load() {
    return Promise.resolve(loadPrototypeConfiguration());
  }

  save(configuration: ReturnType<typeof loadPrototypeConfiguration>) {
    return Promise.resolve(savePrototypeConfiguration(configuration));
  }

  reset() {
    return Promise.resolve(resetPrototypeConfiguration());
  }
}

export const prototypeRepositories = {
  patients: new LocalPatientRepository(),
  encounters: new LocalEncounterRepository(),
  triage: new LocalTriageRepository(),
  beds: new LocalBedRepository(),
  orders: new LocalOrderRepository(),
  results: new LocalResultRepository(),
  medications: new LocalMedicationRepository(),
  notes: new LocalNoteRepository(),
  disposition: new LocalDispositionRepository(),
  notifications: new LocalNotificationRepository(),
  audit: new LocalAuditRepository(),
  configuration: new LocalConfigurationRepository(),
};
