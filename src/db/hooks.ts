import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { db } from "./db";
import type {
  Patient,
  Encounter,
  ClinicalEvent,
  Bed,
  Zone,
  Incident,
  ReconciliationItem,
  AuditEvent,
  TriageLevel,
  TriageAssessment,
  VitalsSet,
} from "../types";

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
