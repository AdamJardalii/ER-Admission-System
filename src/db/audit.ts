import { db } from "./db";
import { uuid } from "./ids";
import type { Mode } from "../types";

export async function writeAudit(params: {
  entityType: string;
  entityId: string;
  action: string;
  previousValue?: string | null;
  newValue?: string | null;
  actor?: string | null;
  mode: Mode;
}) {
  await db.auditEvents.add({
    id: uuid(),
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    previousValue: params.previousValue ?? null,
    newValue: params.newValue ?? null,
    timestamp: Date.now(),
    mode: params.mode,
    actor: params.actor ?? null,
  });
}
