import assert from "node:assert/strict";
import test from "node:test";
import { dedupeFlowsheetColumns } from "../src/lib/vitals.ts";

function setAt(iso, overrides = {}) {
  return {
    id: `set-${iso}-${Math.random().toString(36).slice(2, 7)}`,
    encounterId: "e1",
    patientId: "p1",
    recordedAt: new Date(iso).getTime(),
    heartRate: null,
    systolicBp: null,
    diastolicBp: null,
    spo2: null,
    respiratoryRate: null,
    temperature: null,
    painScore: null,
    bloodGlucose: null,
    supplementalO2: false,
    consciousness: "Alert",
    news2: 0,
    news2Breakdown: {},
    ...overrides,
  };
}

test("two sets in the same minute collapse to one column", () => {
  const cols = dedupeFlowsheetColumns([
    setAt("2026-07-17T09:56:10", { heartRate: 80 }),
    setAt("2026-07-17T09:56:45", { heartRate: 88 }),
  ]);
  assert.equal(cols.length, 1, "same minute must not render two columns");
  assert.equal(cols[0].set.heartRate, 88, "keeps the most recent set's values for that minute");
});

test("distinct minutes each get their own column, in chronological order", () => {
  const cols = dedupeFlowsheetColumns([
    setAt("2026-07-17T09:58:00", { heartRate: 90 }),
    setAt("2026-07-17T09:56:00", { heartRate: 70 }),
    setAt("2026-07-17T09:57:00", { heartRate: 80 }),
  ]);
  assert.equal(cols.length, 3);
  assert.deepEqual(cols.map((c) => c.set.heartRate), [70, 80, 90], "ascending by time");
});

test("no two columns share a displayed timestamp label", () => {
  const cols = dedupeFlowsheetColumns([
    setAt("2026-07-17T09:56:05"),
    setAt("2026-07-17T09:56:55"),
    setAt("2026-07-17T10:01:00"),
    setAt("2026-07-17T10:01:30"),
  ]);
  const labels = cols.map((c) => c.label);
  assert.equal(new Set(labels).size, labels.length, "labels must be unique");
  assert.equal(cols.length, 2);
});

test("same clock time on different days stays separate", () => {
  const cols = dedupeFlowsheetColumns([
    setAt("2026-07-16T09:56:00", { heartRate: 60 }),
    setAt("2026-07-17T09:56:00", { heartRate: 99 }),
  ]);
  assert.equal(cols.length, 2, "9:56 on two different days are two columns");
});

test("empty input yields no columns", () => {
  assert.deepEqual(dedupeFlowsheetColumns([]), []);
});
