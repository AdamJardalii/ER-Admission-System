import { useCallback, useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { db } from "../../../db/db";
import type { AuditEvent, Encounter, OrderRecord, Patient, ResultRecord, TriageAssessment } from "../../../types";

export interface ClinicalWorkspaceSnapshot {
  orders: OrderRecord[];
  results: ResultRecord[];
  patients: Patient[];
  encounters: Encounter[];
  triageAssessments: TriageAssessment[];
  auditEvents: AuditEvent[];
}

const EMPTY_SNAPSHOT: ClinicalWorkspaceSnapshot = {
  orders: [],
  results: [],
  patients: [],
  encounters: [],
  triageAssessments: [],
  auditEvents: [],
};

export function useClinicalWorkspaceSnapshot() {
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<{
    data: ClinicalWorkspaceSnapshot;
    loading: boolean;
    error: string | null;
    updatedAt: number | null;
  }>({ data: EMPTY_SNAPSHOT, loading: true, error: null, updatedAt: null });

  useEffect(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    const subscription = liveQuery(async () => {
      const [orders, results, patients, encounters, triageAssessments, auditEvents] = await Promise.all([
        db.orderRecords.orderBy("orderedAt").reverse().toArray(),
        db.resultRecords.orderBy("resultedAt").reverse().toArray(),
        db.patients.toArray(),
        db.encounters.toArray(),
        db.triageAssessments.toArray(),
        db.auditEvents.orderBy("timestamp").reverse().toArray(),
      ]);
      return { orders, results, patients, encounters, triageAssessments, auditEvents };
    }).subscribe({
      next: (data) => setState({ data, loading: false, error: null, updatedAt: Date.now() }),
      error: (error: unknown) => setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "Clinical worklist could not be loaded.",
      })),
    });
    return () => subscription.unsubscribe();
  }, [retryKey]);

  const retry = useCallback(() => setRetryKey((value) => value + 1), []);
  return { ...state, retry };
}
