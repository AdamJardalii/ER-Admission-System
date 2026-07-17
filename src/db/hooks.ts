import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { db } from "./db";
import type {
  Patient,
  Encounter,
  ClinicalEvent,
  PatientIdentifier,
  RelatedPerson,
  InsurancePolicy,
  CivilRegistryRecord,
  EmploymentRecord,
  MilitaryRecord,
  PendingCase,
  Bed,
  Zone,
  Incident,
  ReconciliationItem,
  AuditEvent,
  TriageLevel,
  TriageAssessment,
  VitalsSet,
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

export type AppNotificationSeverity = "info" | "warning" | "critical";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  severity: AppNotificationSeverity;
  createdAt: number;
  href: string;
  patientLabel: string;
  actor?: string | null;
}

function useLiveQuery<T>(query: () => Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: (v) => setValue(v),
      error: (err) => console.error(err),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export interface EncounterView {
  patient: Patient;
  encounter: Encounter;
  triage: TriageLevel | null;
  triageAlgorithm: "esi" | "start" | null;
  latestEventAt: number;
}

export function useAllActiveEncounters(): EncounterView[] {
  return useLiveQuery(
    async () => {
      const encounters = await db.encounters
        .filter(
          (e) =>
            !["closed", "discharged", "left_without_being_seen", "left_against_medical_advice", "transferred", "transferred_out", "absconded", "died_before_treatment", "deceased"].includes(
              e.state,
            ),
        )
        .toArray();
      const views: EncounterView[] = [];
      for (const encounter of encounters) {
        const patient = await db.patients.get(encounter.patientId);
        if (!patient) continue;
        const triages = await db.triageAssessments
          .where("encounterId")
          .equals(encounter.id)
          .sortBy("performedAt");
        const latest = triages[triages.length - 1];
        views.push({
          patient,
          encounter,
          triage: latest?.level ?? null,
          triageAlgorithm: latest?.algorithm ?? null,
          latestEventAt: encounter.arrivedAt,
        });
      }
      return views;
    },
    [],
    [],
  );
}

export function useAllEncounters(): Encounter[] {
  return useLiveQuery(
    () => db.encounters.orderBy("arrivedAt").reverse().toArray(),
    [],
    [],
  );
}

export function usePatientEncounters(patientId: string | undefined): Encounter[] {
  return useLiveQuery(
    async () => {
      if (!patientId) return [];
      const rows = await db.encounters.where("patientId").equals(patientId).toArray();
      return rows.sort((a, b) => b.arrivedAt - a.arrivedAt);
    },
    [patientId],
    [],
  );
}

export function useEncounterView(encounterId: string | undefined): EncounterView | null {
  return useLiveQuery(
    async () => {
      if (!encounterId) return null;
      const encounter = await db.encounters.get(encounterId);
      if (!encounter) return null;
      const patient = await db.patients.get(encounter.patientId);
      if (!patient) return null;
      const triages = await db.triageAssessments
        .where("encounterId")
        .equals(encounterId)
        .sortBy("performedAt");
      const latest = triages[triages.length - 1];
      return {
        patient,
        encounter,
        triage: latest?.level ?? null,
        triageAlgorithm: latest?.algorithm ?? null,
        latestEventAt: encounter.arrivedAt,
      };
    },
    [encounterId],
    null,
  );
}

export function useClinicalEvents(encounterId: string | undefined): ClinicalEvent[] {
  return useLiveQuery(
    async () => {
      if (!encounterId) return [];
      const rows = await db.clinicalEvents
        .where("encounterId")
        .equals(encounterId)
        .toArray();
      return rows.sort((a, b) => b.recordedAt - a.recordedAt);
    },
    [encounterId],
    [],
  );
}

export function useRecentAppNotifications(limit = 40): AppNotification[] {
  return useLiveQuery(
    async () => {
      const [clinicalEvents, auditEvents] = await Promise.all([
        db.clinicalEvents.orderBy("recordedAt").reverse().limit(limit * 3).toArray(),
        db.auditEvents.orderBy("timestamp").reverse().limit(limit * 3).toArray(),
      ]);
      const encounterIds = new Set<string>();
      const patientIds = new Set<string>();
      clinicalEvents.forEach((event) => encounterIds.add(event.encounterId));
      auditEvents.forEach((event) => {
        if (event.encounterId) encounterIds.add(event.encounterId);
        if (event.patientId) patientIds.add(event.patientId);
      });
      const encounters = await db.encounters.bulkGet([...encounterIds]);
      const encounterById = new Map(encounters.filter(Boolean).map((encounter) => [encounter!.id, encounter!]));
      encounters.forEach((encounter) => {
        if (encounter?.patientId) patientIds.add(encounter.patientId);
      });
      const patients = await db.patients.bulkGet([...patientIds]);
      const patientById = new Map(patients.filter(Boolean).map((patient) => [patient!.id, patient!]));

      const notifications = [
        ...clinicalEvents.map((event) => notificationFromClinicalEvent(event, encounterById, patientById)),
        ...auditEvents.map((event) => notificationFromAuditEvent(event, encounterById, patientById)),
      ]
        .filter((notification): notification is AppNotification => Boolean(notification))
        .sort((a, b) => b.createdAt - a.createdAt);

      return notifications.slice(0, limit);
    },
    [limit],
    [],
  );
}

function notificationFromClinicalEvent(
  event: ClinicalEvent,
  encounterById: Map<string, Encounter>,
  patientById: Map<string, Patient>,
): AppNotification | null {
  const content = event.content ?? {};
  const encounter = encounterById.get(event.encounterId);
  const patient = encounter ? patientById.get(encounter.patientId) : undefined;
  const base = notificationBase(`clinical:${event.id}`, event.recordedAt, event.encounterId, encounter, patient);
  const actor = stringValue(content.actor);

  switch (event.type) {
    case "order": {
      const name = stringValue(content.name) || "Order";
      const priority = stringValue(content.priority);
      return {
        ...base,
        title: `Order added: ${name}`,
        message: [formatClinicalType(content.orderType), priority && `Priority ${priority}`].filter(Boolean).join(" | ") || "New order placed",
        severity: priority === "stat" ? "warning" : "info",
        actor,
      };
    }
    case "order_status": {
      const name = stringValue(content.name) || "Order";
      const status = formatClinicalType(content.status) || "updated";
      return { ...base, title: `${name} ${status}`, message: stringValue(content.reason) || "Order status changed", severity: status.includes("cancel") || status.includes("reject") || status.includes("fail") ? "warning" : "info", actor };
    }
    case "result": {
      const name = stringValue(content.name) || "Result";
      const critical = Boolean(content.critical);
      return {
        ...base,
        title: critical ? `Critical result: ${name}` : `Result available: ${name}`,
        message: stringValue(content.result) || formatClinicalType(content.flag) || "Result available",
        severity: critical ? "critical" : content.flag === "abnormal" ? "warning" : "info",
        actor,
      };
    }
    case "critical_alert": {
      const status = stringValue(content.status);
      if (status === "acknowledged") {
        return { ...base, title: "Critical result acknowledged", message: stringValue(content.actionTaken) || "Action documented", severity: "info", actor };
      }
      return { ...base, title: "Critical result requires acknowledgement", message: "Immediate review needed", severity: "critical", actor };
    }
    case "medication": {
      const medication = stringValue(content.medication) || "Medication";
      const held = Boolean(content.notAdministeredReason);
      return {
        ...base,
        title: held ? `Medication not given: ${medication}` : `Medication administered: ${medication}`,
        message: held ? stringValue(content.notAdministeredReason) || "Reason documented" : [stringValue(content.administeredDose), stringValue(content.route)].filter(Boolean).join(" ") || "Administration recorded",
        severity: held ? "warning" : "info",
        actor,
      };
    }
    case "treatment":
      return { ...base, title: `Treatment recorded: ${stringValue(content.name) || "Care action"}`, message: stringValue(content.details) || "Treatment documented", severity: "info", actor };
    case "assessment":
      return { ...base, title: "Assessment saved", message: stringValue(content.impression) || stringValue(content.plan) || "Clinical assessment documented", severity: "info", actor };
    case "reassessment": {
      const response = stringValue(content.response);
      return { ...base, title: `Reassessment: ${response || "recorded"}`, message: stringValue(content.notes) || "Clinical response reviewed", severity: response === "worse" ? "warning" : "info", actor };
    }
    case "vitals": {
      const news2 = numberValue(content.news2);
      return { ...base, title: "Vitals saved", message: news2 !== null ? `NEWS2 ${news2}` : "Vitals recorded", severity: news2 !== null && news2 >= 7 ? "critical" : news2 !== null && news2 >= 5 ? "warning" : "info" };
    }
    case "re_triage":
      return { ...base, title: `Triage updated: ${stringValue(content.algorithm)?.toUpperCase() ?? "Level"} ${String(content.level ?? "")}`.trim(), message: "Patient priority updated", severity: Number(content.level) <= 2 ? "warning" : "info" };
    case "location":
      return { ...base, title: stringValue(content.locationName) ? `Bed assigned: ${stringValue(content.locationName)}` : "Bed cleared", message: stringValue(content.reason) || stringValue(content.zone) || "Location updated", severity: "info" };
    case "team":
      return { ...base, title: "Provider assigned", message: stringValue(content.provider) || "Care team updated", severity: "info" };
    case "disposition":
      return { ...base, title: `Disposition decision: ${formatClinicalType(content.disposition) || "recorded"}`, message: stringValue(content.details) || "Disposition workflow started", severity: "info", actor };
    case "disposition_status":
      return { ...base, title: `Disposition step: ${formatClinicalType(content.status) || "updated"}`, message: stringValue(content.details) || "Disposition progress recorded", severity: content.closesEncounter ? "warning" : "info", actor };
    default:
      return null;
  }
}

function notificationFromAuditEvent(
  event: AuditEvent,
  encounterById: Map<string, Encounter>,
  patientById: Map<string, Patient>,
): AppNotification | null {
  const duplicateClinicalActions = new Set([
    "order_added",
    "order_placed",
    "order_status_transition",
    "result_added",
    "result_recorded",
    "critical_result_recorded",
    "critical_alert_created",
    "vitals_recorded",
    "assessment_recorded",
    "treatment_recorded",
    "reassessment_recorded",
    "disposition_decided",
  ]);
  if (duplicateClinicalActions.has(event.action)) return null;
  const encounter = event.encounterId ? encounterById.get(event.encounterId) : undefined;
  const patient = event.patientId ? patientById.get(event.patientId) : encounter ? patientById.get(encounter.patientId) : undefined;
  const base = notificationBase(`audit:${event.id}`, event.timestamp, event.encounterId ?? null, encounter, patient);
  const value = event.newValue || event.previousValue || "";

  switch (event.action) {
    case "medication_added":
      return { ...base, title: `Medication added: ${value || "Medication"}`, message: "Medication list updated", severity: "info", actor: event.actor };
    case "allergy_added":
      return { ...base, title: `Allergy added: ${value || "Allergy"}`, message: "Allergy list updated", severity: "critical", actor: event.actor };
    case "condition_added":
      return { ...base, title: `Condition added: ${value || "Condition"}`, message: "Patient history updated", severity: "info", actor: event.actor };
    case "procedure_added":
      return { ...base, title: `Procedure added: ${value || "Procedure"}`, message: "Procedure record created", severity: "info", actor: event.actor };
    case "immunization_added":
      return { ...base, title: `Immunization added: ${value || "Vaccine"}`, message: "Immunization record updated", severity: "info", actor: event.actor };
    case "billing_added":
      return { ...base, title: `Billing item added: ${value || "Item"}`, message: "Billing record updated", severity: "info", actor: event.actor };
    case "attachment_added":
      return { ...base, title: `Attachment added: ${value || "File"}`, message: "Document added to chart", severity: "info", actor: event.actor };
    default:
      return null;
  }
}

function notificationBase(
  id: string,
  createdAt: number,
  encounterId: string | null,
  encounter: Encounter | undefined,
  patient: Patient | undefined,
) {
  const patientLabel = patient?.name ?? patient?.displayNumber ?? encounter?.caseNumber ?? "Patient";
  return {
    id,
    createdAt,
    href: encounterId ? `/patients/${encounterId}` : "/patients",
    patientLabel,
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatClinicalType(value: unknown) {
  return stringValue(value)?.replace(/_/g, " ") ?? null;
}

export function useAllPatients(): Patient[] {
  return useLiveQuery(() => db.patients.toArray(), [], []);
}

export function useIncompleteRegistrations(): Patient[] {
  return useLiveQuery(
    async () => {
      const rows = await db.patients.toArray();
      return rows
        .filter((patient) => !patient.displayNumber.startsWith("#B-"))
        .filter((patient) => patient.registrationComplete === false && !patient.mergedIntoPatientId)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    [],
    [],
  );
}

export function useVitalsSets(encounterId: string | undefined): VitalsSet[] {
  return useLiveQuery(
    async () => {
      if (!encounterId) return [];
      const rows = await db.vitalsSets.where("encounterId").equals(encounterId).toArray();
      return rows.filter((row) => !row.voidedAt).sort((a, b) => b.recordedAt - a.recordedAt);
    },
    [encounterId],
    [],
  );
}

export function useAllVitalsSets(): VitalsSet[] {
  return useLiveQuery(
    async () => (await db.vitalsSets.orderBy("recordedAt").reverse().toArray()).filter((row) => !row.voidedAt),
    [],
    [],
  );
}

export function useStateTransitions(encounterId: string | undefined) {
  return useLiveQuery(
    async () => {
      if (!encounterId) return [];
      const rows = await db.stateTransitions.where("encounterId").equals(encounterId).toArray();
      return rows.sort((a, b) => b.timestamp - a.timestamp);
    },
    [encounterId],
    [],
  );
}

export function useTriageAssessments(encounterId: string | undefined): TriageAssessment[] {
  return useLiveQuery(
    async () => {
      if (!encounterId) return [];
      const rows = await db.triageAssessments
        .where("encounterId")
        .equals(encounterId)
        .toArray();
      return rows.sort((a, b) => b.performedAt - a.performedAt);
    },
    [encounterId],
    [],
  );
}

export function useAuditEvents(entityId: string | undefined): AuditEvent[] {
  return useLiveQuery(
    async () => {
      if (!entityId) return [];
      const rows = await db.auditEvents.where("entityId").equals(entityId).toArray();
      return rows.sort((a, b) => b.timestamp - a.timestamp);
    },
    [entityId],
    [],
  );
}

export function useBeds(): Bed[] {
  return useLiveQuery(() => db.beds.toArray(), [], []);
}

export function useZones(): Zone[] {
  return useLiveQuery(() => db.zones.orderBy("order").toArray(), [], []);
}

export function useActiveIncident(): Incident | null {
  return useLiveQuery(
    async () => {
      const rows = await db.incidents
        .filter((i) => i.deactivatedAt === null)
        .toArray();
      return rows[rows.length - 1] ?? null;
    },
    [],
    null,
  );
}

export function useReconciliationItems(): ReconciliationItem[] {
  return useLiveQuery(() => db.reconciliationItems.toArray(), [], []);
}

export function usePatientCount(): number {
  return useLiveQuery(() => db.patients.count(), [], 0);
}

export function useAlerts(): AuditEvent[] {
  return useLiveQuery(
    async () => {
      const rows = await db.auditEvents.where("action").equals("seed_alert").toArray();
      return rows;
    },
    [],
    [],
  );
}

// --- Patient master profile hooks (Dexie v6) ------------------------------

export function usePatientIdentifiers(patientId: string | undefined): PatientIdentifier[] {
  return useLiveQuery(
    async () => {
      if (!patientId) return [];
      const rows = await db.patientIdentifiers.where("patientId").equals(patientId).toArray();
      return rows.sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) || b.createdAt - a.createdAt);
    },
    [patientId],
    [],
  );
}

export function useRelatedPersons(patientId: string | undefined): RelatedPerson[] {
  return useLiveQuery(
    async () => {
      if (!patientId) return [];
      const rows = await db.relatedPersons.where("patientId").equals(patientId).toArray();
      return rows.sort((a, b) => (a.contactPriority ?? 99) - (b.contactPriority ?? 99) || b.updatedAt - a.updatedAt);
    },
    [patientId],
    [],
  );
}

export function useInsurancePolicies(patientId: string | undefined): InsurancePolicy[] {
  return useLiveQuery(
    async () => {
      if (!patientId) return [];
      const rows = await db.insurancePolicies.where("patientId").equals(patientId).toArray();
      return rows.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.updatedAt - a.updatedAt);
    },
    [patientId],
    [],
  );
}

export function useCivilRegistryRecord(patientId: string | undefined): CivilRegistryRecord | null {
  return useLiveQuery(
    async () => {
      if (!patientId) return null;
      return (await db.civilRegistryRecords.where("patientId").equals(patientId).first()) ?? null;
    },
    [patientId],
    null,
  );
}

export function useEmploymentRecord(patientId: string | undefined): EmploymentRecord | null {
  return useLiveQuery(
    async () => {
      if (!patientId) return null;
      return (await db.employmentRecords.where("patientId").equals(patientId).first()) ?? null;
    },
    [patientId],
    null,
  );
}

export function useMilitaryRecord(patientId: string | undefined): MilitaryRecord | null {
  return useLiveQuery(
    async () => {
      if (!patientId) return null;
      return (await db.militaryRecords.where("patientId").equals(patientId).first()) ?? null;
    },
    [patientId],
    null,
  );
}

export function usePendingCases(patientId: string | undefined): PendingCase[] {
  return useLiveQuery(
    async () => {
      if (!patientId) return [];
      const rows = await db.pendingCases.where("patientId").equals(patientId).toArray();
      return rows.sort((a, b) => b.requestDate - a.requestDate);
    },
    [patientId],
    [],
  );
}

// --- First-class clinical domain hooks (Dexie v5) --------------------------

export function useMedications(patientId: string | undefined): MedicationRecord[] {
  return useLiveQuery(
    async () => {
      if (!patientId) return [];
      const rows = await db.medications.where("patientId").equals(patientId).toArray();
      return rows.sort((a, b) => b.createdAt - a.createdAt);
    },
    [patientId],
    [],
  );
}

export function useAllergyRecords(encounterId: string | undefined): AllergyRecord[] {
  return useLiveQuery(
    async () => {
      if (!encounterId) return [];
      const rows = await db.allergyRecords.where("encounterId").equals(encounterId).toArray();
      return rows.sort((a, b) => b.notedAt - a.notedAt);
    },
    [encounterId],
    [],
  );
}

export function useConditions(patientId: string | undefined): ConditionRecord[] {
  return useLiveQuery(
    async () => {
      if (!patientId) return [];
      const rows = await db.conditions.where("patientId").equals(patientId).toArray();
      return rows.sort((a, b) => b.createdAt - a.createdAt);
    },
    [patientId],
    [],
  );
}

export function useOrderRecords(encounterId: string | undefined): OrderRecord[] {
  return useLiveQuery(
    async () => {
      if (!encounterId) return [];
      const rows = await db.orderRecords.where("encounterId").equals(encounterId).toArray();
      return rows.sort((a, b) => b.orderedAt - a.orderedAt);
    },
    [encounterId],
    [],
  );
}

export function useAllOrderRecords(): OrderRecord[] {
  return useLiveQuery(
    () => db.orderRecords.orderBy("orderedAt").reverse().toArray(),
    [],
    [],
  );
}

export function useResultRecords(encounterId: string | undefined): ResultRecord[] {
  return useLiveQuery(
    async () => {
      if (!encounterId) return [];
      const rows = await db.resultRecords.where("encounterId").equals(encounterId).toArray();
      return rows.sort((a, b) => b.resultedAt - a.resultedAt);
    },
    [encounterId],
    [],
  );
}

export function useAllResultRecords(): ResultRecord[] {
  return useLiveQuery(
    () => db.resultRecords.orderBy("resultedAt").reverse().toArray(),
    [],
    [],
  );
}

export function useImmunizations(patientId: string | undefined): ImmunizationRecord[] {
  return useLiveQuery(
    async () => {
      if (!patientId) return [];
      const rows = await db.immunizations.where("patientId").equals(patientId).toArray();
      return rows.sort((a, b) => b.createdAt - a.createdAt);
    },
    [patientId],
    [],
  );
}

export function useProcedures(encounterId: string | undefined): ProcedureRecord[] {
  return useLiveQuery(
    async () => {
      if (!encounterId) return [];
      const rows = await db.procedures.where("encounterId").equals(encounterId).toArray();
      return rows.sort((a, b) => (b.performedAt ?? b.createdAt) - (a.performedAt ?? a.createdAt));
    },
    [encounterId],
    [],
  );
}

export function usePrograms(patientId: string | undefined): ProgramRecord[] {
  return useLiveQuery(
    async () => {
      if (!patientId) return [];
      const rows = await db.programs.where("patientId").equals(patientId).toArray();
      return rows.sort((a, b) => b.createdAt - a.createdAt);
    },
    [patientId],
    [],
  );
}

export function useBillingItems(encounterId: string | undefined): BillingItem[] {
  return useLiveQuery(
    async () => {
      if (!encounterId) return [];
      const rows = await db.billingItems.where("encounterId").equals(encounterId).toArray();
      return rows.sort((a, b) => b.createdAt - a.createdAt);
    },
    [encounterId],
    [],
  );
}

export function useAttachments(encounterId: string | undefined): Attachment[] {
  return useLiveQuery(
    async () => {
      if (!encounterId) return [];
      const rows = await db.attachments.where("encounterId").equals(encounterId).toArray();
      return rows.sort((a, b) => b.uploadedAt - a.uploadedAt);
    },
    [encounterId],
    [],
  );
}
