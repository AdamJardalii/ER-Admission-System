import { db } from "./db";
import { uuid } from "./ids";
import { resolvePrototypeActor } from "../domain/prototypeUser";
import type { Mode } from "../types";

export async function writeAudit(params: {
  entityType: string;
  entityId: string;
  action: string;
  previousValue?: string | null;
  newValue?: string | null;
  actor?: string | null;
  patientId?: string | null;
  encounterId?: string | null;
  reason?: string | null;
  actorId?: string | null;
  demoRole?: string | null;
  metadata?: Record<string, unknown>;
  mode: Mode;
}) {
  const resolvedActor = resolvePrototypeActor(params.actor);
  const encounterId = params.encounterId ?? (params.entityType === "encounter" ? params.entityId : null);
  const encounter = encounterId ? await db.encounters.get(encounterId) : null;
  const patientId =
    params.patientId ??
    encounter?.patientId ??
    (params.entityType === "patient" ? params.entityId : null);
  await db.auditEvents.add({
    id: uuid(),
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    previousValue: params.previousValue ?? null,
    newValue: params.newValue ?? null,
    timestamp: Date.now(),
    mode: params.mode,
    actor: resolvedActor.actorName,
    patientId,
    encounterId,
    reason: params.reason ?? null,
    actorId: params.actorId ?? resolvedActor.actorId,
    demoRole: params.demoRole ?? resolvedActor.demoRole,
    metadata: params.metadata,
  });
}
