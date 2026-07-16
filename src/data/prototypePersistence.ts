import type { Table } from "dexie";
import { db } from "../db/db";
import { seedInitialData } from "../db/seed";
import { loadDemoStaffId, saveDemoStaffId } from "../domain/prototypeUser";
import {
  loadPrototypeConfiguration,
  migratePrototypeConfiguration,
  resetPrototypeConfiguration,
  savePrototypeConfiguration,
  type PrototypeConfiguration,
} from "./prototypeConfiguration";

export const PROTOTYPE_EXPORT_VERSION = 1;

interface SerializedBlob {
  __prototypeType: "Blob";
  type: string;
  data: string;
}

export interface PrototypeDataSnapshot {
  version: typeof PROTOTYPE_EXPORT_VERSION;
  exportedAt: string;
  configuration: PrototypeConfiguration;
  actingStaffId: string;
  tables: Record<string, unknown[]>;
}

export interface PrototypeDataSummary {
  patients: number;
  encounters: number;
  auditEvents: number;
  notifications: number;
  lastEncounterAt: string | null;
}

const timestampKey = /(At|Time|Timestamp|Date)$/;
const isoDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return window.btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function serializeValue(value: unknown, key = ""): Promise<unknown> {
  if (value instanceof Blob) {
    const serialized: SerializedBlob = {
      __prototypeType: "Blob",
      type: value.type,
      data: bytesToBase64(new Uint8Array(await value.arrayBuffer())),
    };
    return serialized;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" && timestampKey.test(key) && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (Array.isArray(value)) return Promise.all(value.map((item) => serializeValue(item)));
  if (value && typeof value === "object") {
    const serializedEntries = await Promise.all(
      Object.entries(value).map(async ([entryKey, entryValue]) => [entryKey, await serializeValue(entryValue, entryKey)] as const),
    );
    return Object.fromEntries(serializedEntries);
  }
  return value;
}

function isSerializedBlob(value: unknown): value is SerializedBlob {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SerializedBlob>;
  return candidate.__prototypeType === "Blob" && typeof candidate.type === "string" && typeof candidate.data === "string";
}

function deserializeValue(value: unknown, key = ""): unknown {
  if (isSerializedBlob(value)) return new Blob([base64ToBytes(value.data)], { type: value.type });
  if (typeof value === "string" && timestampKey.test(key) && isoDateTime.test(value)) {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  if (Array.isArray(value)) return value.map((item) => deserializeValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, deserializeValue(entryValue, entryKey)]));
  }
  return value;
}

function parseSnapshot(value: string | unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
}

export function migratePrototypeData(value: string | unknown): PrototypeDataSnapshot {
  const parsed = parseSnapshot(value);
  if (!parsed || typeof parsed !== "object") throw new Error("The backup does not contain prototype data.");
  const candidate = parsed as Partial<PrototypeDataSnapshot>;
  const version = Number(candidate.version);
  if (!Number.isInteger(version) || version < 1) throw new Error("The backup version is missing or invalid.");
  if (version > PROTOTYPE_EXPORT_VERSION) {
    throw new Error("This backup was created by a newer prototype version and cannot be imported here.");
  }
  if (!candidate.tables || typeof candidate.tables !== "object" || Array.isArray(candidate.tables)) {
    throw new Error("The backup is missing its data tables.");
  }
  for (const [name, rows] of Object.entries(candidate.tables)) {
    if (!Array.isArray(rows)) throw new Error(`The ${name} table in this backup is invalid.`);
  }
  return {
    version: PROTOTYPE_EXPORT_VERSION,
    exportedAt: typeof candidate.exportedAt === "string" ? candidate.exportedAt : new Date().toISOString(),
    configuration: migratePrototypeConfiguration(candidate.configuration),
    actingStaffId: typeof candidate.actingStaffId === "string" ? candidate.actingStaffId : loadDemoStaffId(),
    tables: candidate.tables as Record<string, unknown[]>,
  };
}

export async function loadPrototypeData(): Promise<PrototypeDataSnapshot> {
  await db.open();
  const tables: Record<string, unknown[]> = {};
  for (const table of db.tables) tables[table.name] = await table.toArray();
  return {
    version: PROTOTYPE_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    configuration: loadPrototypeConfiguration(),
    actingStaffId: loadDemoStaffId(),
    tables,
  };
}

export async function exportPrototypeData() {
  const current = await loadPrototypeData();
  return JSON.stringify(await serializeValue(current), null, 2);
}

async function replaceTables(snapshot: PrototypeDataSnapshot) {
  await db.open();
  const availableTables = new Map<string, Table>(db.tables.map((table) => [table.name, table]));
  const recognizedTables = Object.keys(snapshot.tables).filter((name) => availableTables.has(name));
  if (!recognizedTables.includes("patients") || !recognizedTables.includes("encounters")) {
    throw new Error("The backup must include both patients and encounters.");
  }

  const decoded = new Map<string, unknown[]>();
  for (const name of recognizedTables) {
    decoded.set(name, snapshot.tables[name].map((row) => deserializeValue(row)));
  }

  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
    for (const [name, rows] of decoded) {
      if (rows.length) await availableTables.get(name)!.bulkAdd(rows);
    }
  });
}

export async function savePrototypeData(snapshot: PrototypeDataSnapshot, options: { confirmed: boolean }) {
  if (!options.confirmed) throw new Error("Import must be confirmed before replacing saved prototype data.");
  const migrated = migratePrototypeData(snapshot);
  await replaceTables(migrated);
  savePrototypeConfiguration(migrated.configuration);
  saveDemoStaffId(migrated.actingStaffId);
}

export async function importPrototypeData(value: string | unknown, options: { confirmed: boolean }) {
  if (!options.confirmed) throw new Error("Import must be confirmed before replacing saved prototype data.");
  const migrated = migratePrototypeData(value);
  await savePrototypeData(migrated, options);
  return migrated;
}

export async function resetPrototypeData(options: { confirmed: boolean }) {
  if (!options.confirmed) throw new Error("Reset must be confirmed before deleting saved prototype data.");
  await db.open();
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  resetPrototypeConfiguration();
  await seedInitialData();
}

export async function getPrototypeDataSummary(): Promise<PrototypeDataSummary> {
  await db.open();
  const [patients, encounters, auditEvents, notifications, latestEncounter] = await Promise.all([
    db.patients.count(),
    db.encounters.count(),
    db.auditEvents.count(),
    db.prototypeNotifications.count(),
    db.encounters.orderBy("arrivedAt").last(),
  ]);
  return {
    patients,
    encounters,
    auditEvents,
    notifications,
    lastEncounterAt: latestEncounter ? new Date(latestEncounter.arrivedAt).toISOString() : null,
  };
}
