import { db } from "./db";
import {
  uuid,
  nextCaseNumber,
  nextDisplayNumber,
  nextMrn,
  seedCounters,
  seedIdentityCounters,
} from "./ids";
import { writeAudit } from "./audit";
import {
  encounterTransitions,
  isTerminalEncounterStatus,
  legacyStateForWorkflowStatus,
  workflowStatusForEncounter,
  workflowStatusFromLegacy,
} from "../domain/encounterStateMachine";
import { DEFAULT_REFERENCE_RANGES, DEFAULT_VITALS_SCHEDULES, calculateBmi, implausibleFields, scoreNews2 } from "../lib/vitals";
import type {
  Patient,
  Encounter,
  TriageAssessment,
  ClinicalEvent,
  Bed,
  Zone,
  ReconciliationItem,
  StartColor,
  PatientIdentifier,
  RelatedPerson,
  InsurancePolicy,
  CivilRegistryRecord,
  EmploymentRecord,
  MilitaryRecord,
  PendingCase,
  VitalsSet,
  Avpu,
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
  AuditEvent,
  EncounterStatus,
  StateTransition,
} from "../types";

const ZONES: Zone[] = [
  { id: "zone-trauma", name: "Trauma", order: 1 },
  { id: "zone-acute", name: "Acute", order: 2 },
  { id: "zone-fasttrack", name: "Fast-track", order: 3 },
  { id: "zone-observation", name: "Observation", order: 4 },
];

const BED_COUNTS: Record<string, number> = {
  "zone-trauma": 6,
  "zone-acute": 10,
  "zone-fasttrack": 8,
  "zone-observation": 6,
};

const LEBANESE_NAMES = [
  "Rami Haddad",
  "Layal Khoury",
  "Karim Abou Chacra",
  "Nour el-Zein",
  "Elie Frangieh",
  "Maya Sarkis",
  "Jad Nassar",
  "Christelle Matta",
  "Wissam Fakhoury",
  "Rania Daou",
  "Tony Ghandour",
  "Sana Barakat",
  "Georges Chidiac",
  "Yara Aoun",
  "Fadi Salameh",
  "Mira Boustany",
  "Hassan Zeidan",
  "Joelle Chamoun",
  "Ziad Rahal",
  "Carla Tannous",
];

const CHIEF_COMPLAINTS = [
  "Chest pain",
  "Shortness of breath",
  "Abdominal pain",
  "Laceration - left hand",
  "Fall, head injury",
  "Fever and cough",
  "Ankle sprain",
  "Allergic reaction",
  "Migraine",
  "Back pain",
];

const ALLERGIES_POOL = ["Penicillin", "Latex", "Peanuts", "Iodine", "Sulfa drugs"];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function isSeeded(): Promise<boolean> {
  const count = await db.patients.count();
  return count > 0;
}

let seedInFlight: Promise<void> | null = null;

// React StrictMode double-invokes mount effects, which would otherwise race
// two concurrent seed runs past the isSeeded() check before either has written.
export function seedInitialData(): Promise<void> {
  if (!seedInFlight) {
    seedInFlight = seedInitialDataInner().finally(() => {
      seedInFlight = null;
    });
  }
  return seedInFlight;
}

async function seedInitialDataInner() {
  if (await isSeeded()) {
    await ensureMockPatientHistory();
    await ensurePerfectMockPatient();
    await ensureClinicalFoundationSeeds();
    await ensureDomainSeeds();
    await ensureRegistrationProfileSeed();
    await ensurePhaseOneSeedMetadata();
    return;
  }

  await db.zones.bulkAdd(ZONES);

  const beds: Bed[] = [];
  for (const zone of ZONES) {
    const n = BED_COUNTS[zone.id];
    for (let i = 1; i <= n; i++) {
      beds.push({
        id: uuid(),
        name: `${zone.name.split(" ")[0].slice(0, 2).toUpperCase()}-${i}`,
        zone: zone.id,
        encounterId: null,
      });
    }
  }

  const esiLevels: (1 | 2 | 3 | 4 | 5)[] = [1, 2, 2, 3, 3, 3, 4, 5];
  const patients: Patient[] = [];
  const encounters: Encounter[] = [];
  const triages: TriageAssessment[] = [];
  const events: ClinicalEvent[] = [];

  const names = [...LEBANESE_NAMES].sort(() => Math.random() - 0.5);

  for (let i = 0; i < 8; i++) {
    const now = Date.now();
    const arrivedAt = now - randInt(10, 240) * 60 * 1000;
    const displayNumber = nextDisplayNumber("normal");
    const patientId = uuid();
    const encounterId = uuid();
    const esi = esiLevels[i];
    const bedIndex = i < 6 ? i : -1;

    const patient: Patient = {
      id: patientId,
      displayNumber,
      mrn: nextMrn(),
      name: names[i],
      dateOfBirth: `19${randInt(45, 99)}-0${randInt(1, 9)}-1${randInt(0, 9)}`,
      sex: rand(["male", "female"]),
      phone: `+961 ${randInt(3, 81)} ${randInt(100000, 999999)}`,
      photoBlob: null,
      identityStatus: "confirmed",
      estimatedAgeRange: null,
      createdAt: arrivedAt,
    };

    const zone = ZONES[Math.min(3, Math.floor(i / 2))];
    const bed = bedIndex >= 0 ? beds.find((b) => b.zone === zone.id && !b.encounterId) : null;

    const encounter: Encounter = {
      id: encounterId,
      caseNumber: nextCaseNumber(),
      patientId,
      incidentId: null,
      modeAtCreation: "normal",
      arrivedAt,
      state: esi <= 2 ? "in_treatment" : "triaged",
      disposition: null,
      closedAt: null,
      chiefComplaint: rand(CHIEF_COMPLAINTS),
      allergies: Math.random() > 0.6 ? [rand(ALLERGIES_POOL)] : [],
      currentLocationName: bed ? bed.name : null,
      currentZone: bed ? zone.id : null,
      currentProvider: Math.random() > 0.4 ? "Demo Provider" : null,
    };

    if (bed) bed.encounterId = encounterId;

    patients.push(patient);
    encounters.push(encounter);
    triages.push({
      id: uuid(),
      encounterId,
      algorithm: "esi",
      level: esi,
      performedAt: arrivedAt + 3 * 60 * 1000,
      note: null,
    });
    events.push({
      id: uuid(),
      encounterId,
      type: "created",
      content: { displayNumber, mode: "normal" },
      attachmentBlob: null,
      recordedAt: arrivedAt,
    });
    events.push({
      id: uuid(),
      encounterId,
      type: "vitals",
      content: {
        bp: `${randInt(100, 140)}/${randInt(60, 90)}`,
        hr: randInt(60, 110),
        spo2: randInt(93, 100),
        temp: (36 + Math.random() * 2).toFixed(1),
      },
      attachmentBlob: null,
      recordedAt: arrivedAt + 5 * 60 * 1000,
    });
  }

  await db.beds.bulkAdd(beds);
  await db.patients.bulkAdd(patients);
  await db.encounters.bulkAdd(encounters);
  await db.triageAssessments.bulkAdd(triages);
  await db.clinicalEvents.bulkAdd(events);

  for (const e of encounters) {
    await writeAudit({
      entityType: "encounter",
      entityId: e.id,
      action: "created",
      newValue: e.chiefComplaint ?? "",
      mode: "normal",
    });
  }

  await db.auditEvents.add({
    id: uuid(),
    entityType: "system",
    entityId: "seed",
    action: "seed_alert",
    previousValue: null,
    newValue: "Lab turnaround delayed 20+ min",
    timestamp: Date.now(),
    mode: "normal",
  });

  await ensureMockPatientHistory();
  await ensurePerfectMockPatient();
  await ensureClinicalFoundationSeeds();
  await ensureDomainSeeds();
  await ensureRegistrationProfileSeed();
  await ensurePhaseOneSeedMetadata();
}

const PHASE_ONE_SEED_MARKER = "phase1_foundation_seed_v1";

function seedPathTo(target: EncounterStatus) {
  const queue: EncounterStatus[][] = [["ARRIVED"]];
  const visited = new Set<EncounterStatus>();
  while (queue.length) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    if (current === target) return path;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of encounterTransitions[current]) queue.push([...path, next]);
  }
  throw new Error(`No synthetic seed path exists for ${target}.`);
}

function seedTransitionRows(encounterId: string, path: EncounterStatus[], startedAt: number, endedAt: number): StateTransition[] {
  const interval = Math.max(1, Math.floor((endedAt - startedAt) / Math.max(1, path.length - 1)));
  return path.map((status, index) => {
    const previousStatus = path[index - 1] ?? null;
    const timestamp = startedAt + interval * index;
    return {
      id: uuid(),
      encounterId,
      previousState: previousStatus ? legacyStateForWorkflowStatus(previousStatus) : null,
      newState: legacyStateForWorkflowStatus(status),
      reason: index === 0 ? "Synthetic encounter seeded" : `Synthetic workflow advanced to ${status}`,
      actor: "Synthetic seed",
      device: "local browser",
      source: "local",
      timestamp,
      workflowFromStatus: previousStatus,
      workflowToStatus: status,
      actorId: "seed-system",
      actorName: "Synthetic seed",
      occurredAt: new Date(timestamp).toISOString(),
      metadata: { synthetic: true },
    };
  });
}

function seedDisposition(status: EncounterStatus): Encounter["disposition"] {
  if (["ADMIT_REQUESTED", "ACCEPTANCE_PENDING", "BED_ASSIGNED", "BOARDING", "DEPARTED_ADMITTED"].includes(status)) return "admitted";
  if (["TRANSFER_PENDING", "HANDOFF_PENDING", "DEPARTED_TRANSFERRED"].includes(status)) return "transferred";
  if (["DISCHARGE_PENDING", "READY_FOR_DEPARTURE", "DEPARTED_DISCHARGED"].includes(status)) return "discharged";
  return null;
}

async function ensurePhaseOneFoundationSeed() {
  const completed = await db.auditEvents.where("action").equals(PHASE_ONE_SEED_MARKER).first();
  if (completed) return;

  const now = Date.now();
  const existingPatients = await db.patients.toArray();
  const newPatients: Patient[] = [];
  const newIdentifiers: PatientIdentifier[] = [];
  const missingPatients = Math.max(0, 50 - existingPatients.length);
  for (let index = 0; index < missingPatients; index += 1) {
    const sequence = existingPatients.length + index + 1;
    const id = uuid();
    const mrn = nextMrn();
    const createdAt = now - (sequence + 90) * 24 * 60 * 60 * 1000;
    newPatients.push({
      id,
      displayNumber: nextDisplayNumber("normal"),
      mrn,
      name: LEBANESE_NAMES[sequence % LEBANESE_NAMES.length],
      dateOfBirth: `${1955 + (sequence % 48)}-${String((sequence % 12) + 1).padStart(2, "0")}-${String((sequence % 27) + 1).padStart(2, "0")}`,
      sex: sequence % 2 === 0 ? "female" : "male",
      phone: `+961 ${sequence % 2 === 0 ? 3 : 71} ${String(200000 + sequence * 137).slice(-6)}`,
      photoBlob: null,
      identityStatus: sequence % 11 === 0 ? "provisional" : "confirmed",
      estimatedAgeRange: null,
      registrationComplete: sequence % 9 !== 0,
      isSynthetic: true,
      createdAt,
    });
    newIdentifiers.push({ id: uuid(), patientId: id, type: "mrn", value: mrn, isPrimary: true, createdAt });
  }
  if (newPatients.length) {
    await db.patients.bulkAdd(newPatients);
    await db.patientIdentifiers.bulkAdd(newIdentifiers);
  }

  const patients = await db.patients.toArray();
  const existingEncounters = await db.encounters.toArray();
  const activeEncounters = existingEncounters.filter(
    (encounter) => !isTerminalEncounterStatus(workflowStatusForEncounter(encounter)),
  );
  const patientsWithActiveEncounter = new Set(activeEncounters.map((encounter) => encounter.patientId));
  const availablePatients = patients.filter((patient) => !patientsWithActiveEncounter.has(patient.id));
  const activeTargets: EncounterStatus[] = [
    "TRIAGED",
    "WAITING",
    "ROOMED",
    "IN_ASSESSMENT",
    "AWAITING_RESULTS",
    "DISPOSITION_PENDING",
    "ADMIT_REQUESTED",
    "ACCEPTANCE_PENDING",
    "BOARDING",
    "DISCHARGE_PENDING",
    "TRANSFER_PENDING",
  ];
  const activeToAdd = Math.max(0, Math.min(30 - activeEncounters.length, availablePatients.length));
  const encountersToAdd: Encounter[] = [];
  const triageToAdd: TriageAssessment[] = [];
  const eventsToAdd: ClinicalEvent[] = [];
  const transitionsToAdd: StateTransition[] = [];
  const auditsToAdd: AuditEvent[] = [];

  for (let index = 0; index < activeToAdd; index += 1) {
    const patient = availablePatients[index];
    const target = activeTargets[index % activeTargets.length];
    const path = seedPathTo(target);
    const arrivedAt = now - (18 + index * 7) * 60_000;
    const encounterId = uuid();
    const roomed = path.includes("ROOMED");
    encountersToAdd.push({
      id: encounterId,
      caseNumber: nextCaseNumber(),
      patientId: patient.id,
      incidentId: null,
      modeAtCreation: "normal",
      pathway: index % 8 === 0 ? "critical" : index % 5 === 0 ? "fast_track" : "standard",
      arrivedAt,
      state: legacyStateForWorkflowStatus(target),
      workflowStatus: target,
      disposition: seedDisposition(target),
      closedAt: null,
      chiefComplaint: CHIEF_COMPLAINTS[index % CHIEF_COMPLAINTS.length],
      arrivalMethod: index % 6 === 0 ? "ambulance" : "walk_in",
      referralSource: null,
      allergies: index % 7 === 0 ? [ALLERGIES_POOL[index % ALLERGIES_POOL.length]] : [],
      currentLocationName: roomed ? `AC-${(index % 10) + 1}` : null,
      currentZone: roomed ? "zone-acute" : null,
      currentProvider: roomed ? "Dr. Sami Rahal" : null,
      assignedNurse: roomed ? "Omar Khalil" : null,
      updatedAt: now - index * 60_000,
    });
    triageToAdd.push({
      id: uuid(),
      encounterId,
      algorithm: "esi",
      level: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5,
      performedAt: arrivedAt + 4 * 60_000,
      note: "Synthetic triage scenario",
    });
    eventsToAdd.push({
      id: uuid(),
      encounterId,
      type: "created",
      content: { synthetic: true, scenario: target },
      attachmentBlob: null,
      recordedAt: arrivedAt,
    });
    transitionsToAdd.push(...seedTransitionRows(encounterId, path, arrivedAt, now - index * 60_000));
    auditsToAdd.push({
      id: uuid(),
      entityType: "encounter",
      entityId: encounterId,
      action: "synthetic_encounter_seeded",
      previousValue: null,
      newValue: target,
      timestamp: arrivedAt,
      mode: "normal",
      actor: "Synthetic seed",
      actorId: "seed-system",
      demoRole: "administrator",
      patientId: patient.id,
      encounterId,
      metadata: { synthetic: true },
    });
  }

  const historicalCount = existingEncounters.filter((encounter) => isTerminalEncounterStatus(workflowStatusForEncounter(encounter))).length;
  const historicalToAdd = Math.max(0, 60 - historicalCount);
  for (let index = 0; index < historicalToAdd; index += 1) {
    const patient = patients[index % patients.length];
    const arrivedAt = now - (index + 12) * 36 * 60 * 60 * 1000;
    const closedAt = arrivedAt + (85 + (index % 90)) * 60_000;
    const encounterId = uuid();
    const target: EncounterStatus = "DEPARTED_DISCHARGED";
    encountersToAdd.push({
      id: encounterId,
      caseNumber: nextCaseNumber(new Date(arrivedAt).getFullYear()),
      patientId: patient.id,
      incidentId: null,
      modeAtCreation: "normal",
      pathway: "standard",
      arrivedAt,
      state: "discharged",
      workflowStatus: target,
      disposition: "discharged",
      closedAt,
      chiefComplaint: CHIEF_COMPLAINTS[(index + 3) % CHIEF_COMPLAINTS.length],
      arrivalMethod: index % 9 === 0 ? "ambulance" : "walk_in",
      referralSource: null,
      allergies: [],
      currentLocationName: null,
      currentZone: null,
      currentProvider: index % 2 === 0 ? "Dr. Sami Rahal" : "Dr. Laila Daher",
      updatedAt: closedAt,
    });
    triageToAdd.push({
      id: uuid(),
      encounterId,
      algorithm: "esi",
      level: (((index + 2) % 5) + 1) as 1 | 2 | 3 | 4 | 5,
      performedAt: arrivedAt + 5 * 60_000,
      note: "Synthetic historical triage",
    });
    eventsToAdd.push(
      { id: uuid(), encounterId, type: "created", content: { synthetic: true }, attachmentBlob: null, recordedAt: arrivedAt },
      { id: uuid(), encounterId, type: "disposition", content: { disposition: "discharged", synthetic: true }, attachmentBlob: null, recordedAt: closedAt },
    );
    transitionsToAdd.push(...seedTransitionRows(encounterId, seedPathTo(target), arrivedAt, closedAt));
    auditsToAdd.push({
      id: uuid(),
      entityType: "encounter",
      entityId: encounterId,
      action: "synthetic_historical_encounter_seeded",
      previousValue: null,
      newValue: target,
      timestamp: closedAt,
      mode: "normal",
      actor: "Synthetic seed",
      actorId: "seed-system",
      demoRole: "administrator",
      patientId: patient.id,
      encounterId,
      metadata: { synthetic: true },
    });
  }

  await db.transaction("rw", db.encounters, db.triageAssessments, db.clinicalEvents, db.stateTransitions, db.auditEvents, async () => {
    if (encountersToAdd.length) await db.encounters.bulkAdd(encountersToAdd);
    if (triageToAdd.length) await db.triageAssessments.bulkAdd(triageToAdd);
    if (eventsToAdd.length) await db.clinicalEvents.bulkAdd(eventsToAdd);
    if (transitionsToAdd.length) await db.stateTransitions.bulkAdd(transitionsToAdd);
    if (auditsToAdd.length) await db.auditEvents.bulkAdd(auditsToAdd);
    await db.auditEvents.add({
      id: uuid(),
      entityType: "system",
      entityId: "prototype-seed",
      action: PHASE_ONE_SEED_MARKER,
      previousValue: null,
      newValue: "Synthetic Phase 1 foundation seeded",
      timestamp: Date.now(),
      mode: "normal",
      actor: "Synthetic seed",
      actorId: "seed-system",
      demoRole: "administrator",
      metadata: { synthetic: true, minimumPatients: 50, activeEncounters: 30, historicalEncounters: 60 },
    });
  });
}

async function ensurePhaseOneSeedMetadata() {
  await ensurePhaseOneFoundationSeed();
  const [patients, encounters, transitions, audits] = await Promise.all([
    db.patients.toArray(),
    db.encounters.toArray(),
    db.stateTransitions.toArray(),
    db.auditEvents.toArray(),
  ]);
  const encountersById = new Map(encounters.map((encounter) => [encounter.id, encounter]));

  await db.transaction("rw", db.patients, db.encounters, db.stateTransitions, db.auditEvents, async () => {
    for (const patient of patients) {
      if (patient.isSynthetic !== true) await db.patients.update(patient.id, { isSynthetic: true });
    }
    for (const encounter of encounters) {
      if (!encounter.workflowStatus) {
        await db.encounters.update(encounter.id, {
          workflowStatus: workflowStatusFromLegacy(encounter.state, encounter.disposition),
        });
      }
    }
    for (const transition of transitions) {
      const encounter = encountersById.get(transition.encounterId);
      const updates = {
        workflowFromStatus:
          transition.workflowFromStatus ??
          (transition.previousState ? workflowStatusFromLegacy(transition.previousState, encounter?.disposition ?? null) : null),
        workflowToStatus:
          transition.workflowToStatus ?? workflowStatusFromLegacy(transition.newState, encounter?.disposition ?? null),
        occurredAt: transition.occurredAt ?? new Date(transition.timestamp).toISOString(),
        actorName: transition.actorName ?? transition.actor ?? "Synthetic seed",
      };
      if (!transition.workflowToStatus || !transition.occurredAt || !transition.actorName) {
        await db.stateTransitions.update(transition.id, updates);
      }
    }
    for (const audit of audits) {
      if (!audit.actor) {
        await db.auditEvents.update(audit.id, {
          actor: "Synthetic seed",
          actorId: audit.actorId ?? "seed-system",
          demoRole: audit.demoRole ?? "administrator",
        });
      }
    }
  });

  if ((await db.prototypeNotifications.count()) === 0) {
    const active = encounters.filter((encounter) => !encounter.closedAt).slice(0, 2);
    const now = Date.now();
    await db.prototypeNotifications.bulkAdd([
      {
        id: uuid(),
        type: "prototype_safety",
        severity: "warning",
        title: "Prototype thresholds require review",
        message: "Operational and clinical thresholds in this training build are not validated for patient care.",
        patientId: null,
        encounterId: null,
        createdAt: now - 8 * 60_000,
        readAt: null,
        acknowledgedAt: null,
        acknowledgedBy: null,
      },
      {
        id: uuid(),
        type: "registration_incomplete",
        severity: "info",
        title: "Synthetic registration follow-up",
        message: "A fictional patient record is available for registration workflow testing.",
        patientId: active[0]?.patientId ?? null,
        encounterId: active[0]?.id ?? null,
        createdAt: now - 4 * 60_000,
        readAt: null,
        acknowledgedAt: null,
        acknowledgedBy: null,
      },
    ]);
  }
}

async function ensureMockPatientHistory() {
  const patients = (await db.patients.toArray()).sort((a, b) => a.createdAt - b.createdAt);
  const encounters = (await db.encounters.toArray()).sort((a, b) => a.arrivedAt - b.arrivedAt);
  const mrnMax = patients.reduce((max, patient) => {
    const value = Number(patient.mrn?.match(/MRN-(\d+)/)?.[1] ?? 0);
    return Math.max(max, value);
  }, 100000);
  const caseMax = encounters.reduce((max, encounter) => {
    const value = Number(encounter.caseNumber?.match(/ER-\d{4}-(\d+)/)?.[1] ?? 0);
    return Math.max(max, value);
  }, 5000);
  seedIdentityCounters(mrnMax, caseMax);

  const normalPatients = patients.filter((patient) => !patient.displayNumber.startsWith("#B-"));
  for (const patient of normalPatients) {
    if (!patient.mrn) {
      patient.mrn = nextMrn();
      await db.patients.update(patient.id, { mrn: patient.mrn });
    }
  }

  for (const encounter of encounters) {
    if (!encounter.caseNumber) {
      encounter.caseNumber = encounter.modeAtCreation === "catastrophe"
        ? (await db.patients.get(encounter.patientId))?.displayNumber ?? encounter.id.slice(0, 8)
        : nextCaseNumber(new Date(encounter.arrivedAt).getFullYear());
      await db.encounters.update(encounter.id, { caseNumber: encounter.caseNumber });
    }
  }

  const historyTemplates = [
    [
      { complaint: "Migraine with nausea", impression: "Migraine without focal neurological deficit", treatment: "Analgesia and antiemetic given" },
      { complaint: "Chest discomfort", impression: "Low-risk chest pain; serial ECG and troponin negative", treatment: "Aspirin given and observed" },
    ],
    [
      { complaint: "Fever and productive cough", impression: "Community-acquired pneumonia", treatment: "First antibiotic dose given" },
      { complaint: "Allergic skin reaction", impression: "Urticaria without airway involvement", treatment: "Antihistamine given" },
    ],
    [
      { complaint: "Right ankle injury", impression: "Ankle sprain; X-ray negative", treatment: "Compression wrap and analgesia" },
      { complaint: "Abdominal pain", impression: "Nonspecific abdominal pain; imaging reassuring", treatment: "IV fluids and symptom control" },
    ],
  ];

  for (let patientIndex = 0; patientIndex < Math.min(3, normalPatients.length); patientIndex++) {
    const patient = normalPatients[patientIndex];
    const existingVisits = await db.encounters.where("patientId").equals(patient.id).toArray();
    const needed = Math.max(0, 3 - existingVisits.length);
    if (needed === 0) continue;

    await db.patients.update(patient.id, {
      bloodGroup: patient.bloodGroup ?? ["O+", "A+", "B+"][patientIndex],
      knownConditions: patient.knownConditions?.length
        ? patient.knownConditions
        : [["Migraine"], ["Hypertension"], ["Asthma"]][patientIndex],
      currentMedications: patient.currentMedications?.length
        ? patient.currentMedications
        : [["Sumatriptan as needed"], ["Amlodipine 5 mg daily"], ["Salbutamol inhaler as needed"]][patientIndex],
    });

    for (let visitIndex = 0; visitIndex < needed; visitIndex++) {
      const template = historyTemplates[patientIndex][visitIndex % 2];
      const arrivedAt = Date.now() - (120 + patientIndex * 35 + visitIndex * 210) * 24 * 60 * 60 * 1000;
      const closedAt = arrivedAt + (95 + visitIndex * 20) * 60 * 1000;
      const encounterId = uuid();
      const caseNumber = nextCaseNumber(new Date(arrivedAt).getFullYear());
      const encounter: Encounter = {
        id: encounterId,
        caseNumber,
        patientId: patient.id,
        incidentId: null,
        modeAtCreation: "normal",
        arrivedAt,
        state: "closed",
        disposition: "discharged",
        closedAt,
        chiefComplaint: template.complaint,
        arrivalMethod: "walk_in",
        referralSource: null,
        allergies: existingVisits[0]?.allergies ?? [],
        currentLocationName: null,
        currentZone: null,
        currentProvider: visitIndex === 0 ? "Dr. Haddad" : "Dr. Aoun",
      };
      const triageId = uuid();
      const orderId = uuid();
      const eventsForVisit: ClinicalEvent[] = [
        {
          id: uuid(),
          encounterId,
          type: "created",
          content: { caseNumber, mrn: patient.mrn, mode: "normal" },
          attachmentBlob: null,
          recordedAt: arrivedAt,
        },
        {
          id: uuid(),
          encounterId,
          type: "assessment",
          content: { symptoms: template.complaint, impression: template.impression, plan: "Investigations, symptom control, and reassessment", actor: encounter.currentProvider },
          attachmentBlob: null,
          recordedAt: arrivedAt + 18 * 60 * 1000,
        },
        {
          id: orderId,
          encounterId,
          type: "order",
          content: { orderType: "laboratory", name: "Emergency assessment panel", details: "Historical mock order", priority: "routine", actor: encounter.currentProvider, status: "completed" },
          attachmentBlob: null,
          recordedAt: arrivedAt + 24 * 60 * 1000,
        },
        {
          id: uuid(),
          encounterId,
          type: "result",
          content: { orderId, result: "Results reviewed; no critical abnormality", actor: encounter.currentProvider, critical: false, verified: true },
          attachmentBlob: null,
          recordedAt: arrivedAt + 52 * 60 * 1000,
        },
        {
          id: uuid(),
          encounterId,
          type: "treatment",
          content: { name: template.treatment, details: "Completed during prior visit", actor: "Nurse Sarkis", orderId: null },
          attachmentBlob: null,
          recordedAt: arrivedAt + 58 * 60 * 1000,
        },
        {
          id: uuid(),
          encounterId,
          type: "disposition",
          content: { disposition: "discharged", status: "departed", actor: encounter.currentProvider, details: "Improved; return precautions provided" },
          attachmentBlob: null,
          recordedAt: closedAt,
        },
      ];
      await db.encounters.add(encounter);
      await db.triageAssessments.add({
        id: triageId,
        encounterId,
        algorithm: "esi",
        level: visitIndex === 0 ? 3 : 4,
        performedAt: arrivedAt + 6 * 60 * 1000,
        note: "Historical mock triage",
      });
      await db.clinicalEvents.bulkAdd(eventsForVisit);
    }
  }
}

const PERFECT_DEMO_PATIENT_ID = "demo-perfect-patient";
const PERFECT_DEMO_ENCOUNTER_ID = "demo-perfect-encounter";

async function ensurePerfectMockPatient() {
  const now = Date.now();
  const arrivedAt = now - 92 * 60 * 1000;
  const at = (minutes: number) => arrivedAt + minutes * 60 * 1000;
  const existingBed = await db.beds.where("encounterId").equals(PERFECT_DEMO_ENCOUNTER_ID).first();
  const acuteBeds = existingBed ? [] : await db.beds.where("zone").equals("zone-acute").toArray();
  const bed = existingBed ?? acuteBeds.find((candidate) => !candidate.encounterId) ?? null;
  const locationName = bed?.name ?? "Acute Demo Bay";
  const zone = bed?.zone ?? "zone-acute";

  const patient: Patient = {
    id: PERFECT_DEMO_PATIENT_ID,
    displayNumber: "#DEMO-001",
    mrn: "DEMO-MRN-001",
    name: "Maya Mansour",
    dateOfBirth: "1988-04-16",
    sex: "female",
    phone: "+961 70 555 014",
    nationalId: "1988-0416-2374",
    email: "maya.mansour@example.test",
    address: "24 Cedar Street, Building B",
    city: "Beirut",
    nationality: "Lebanese",
    preferredLanguage: "Arabic and English",
    emergencyContact: "Rami Mansour | Spouse | +961 71 555 018",
    emergencyContactName: "Rami Mansour",
    emergencyContactRelationship: "Spouse",
    emergencyContactPhone: "+961 71 555 018",
    insurance: "MedCare Lebanon | MCL-884210",
    insuranceProvider: "MedCare Lebanon",
    insurancePolicyNumber: "MCL-884210",
    bloodGroup: "A+",
    knownConditions: ["Hypertension", "Gastroesophageal reflux disease"],
    currentMedications: ["Amlodipine 5 mg daily", "Omeprazole 20 mg daily"],
    photoBlob: null,
    identityStatus: "confirmed",
    estimatedAgeRange: null,
    createdAt: arrivedAt,
  };

  const encounter: Encounter = {
    id: PERFECT_DEMO_ENCOUNTER_ID,
    caseNumber: "ER-DEMO-001",
    patientId: PERFECT_DEMO_PATIENT_ID,
    incidentId: null,
    modeAtCreation: "normal",
    arrivedAt,
    state: "observation",
    disposition: "observation",
    closedAt: null,
    chiefComplaint: "Central chest pressure with shortness of breath for 45 minutes",
    arrivalMethod: "ambulance",
    referralSource: "Beirut EMS Unit 12",
    allergies: ["Penicillin - urticaria"],
    currentLocationName: locationName,
    currentZone: zone,
    currentProvider: "Dr. Lina Khoury",
  };

  const triages: TriageAssessment[] = [
    {
      id: "demo-perfect-triage-initial",
      encounterId: PERFECT_DEMO_ENCOUNTER_ID,
      algorithm: "esi",
      level: 2,
      performedAt: at(5),
      note: "High-risk chest pain; immediate ECG, monitoring, and physician review initiated.",
    },
    {
      id: "demo-perfect-triage-repeat",
      encounterId: PERFECT_DEMO_ENCOUNTER_ID,
      algorithm: "esi",
      level: 3,
      performedAt: at(58),
      note: "Symptoms improved, hemodynamically stable, continuing serial cardiac observation.",
    },
  ];

  const orders = {
    ecg: "demo-perfect-order-ecg",
    troponin: "demo-perfect-order-troponin",
    labs: "demo-perfect-order-labs",
    xray: "demo-perfect-order-xray",
    medication: "demo-perfect-order-aspirin",
  };

  const events: ClinicalEvent[] = [
    demoEvent("created", 0, { caseNumber: encounter.caseNumber, mrn: patient.mrn, mode: "normal" }),
    demoEvent("team", 2, { provider: "Dr. Lina Khoury", nurse: "Nurse Karim Haddad", actor: "Charge Nurse Rana" }),
    demoEvent("location", 3, { locationName, zone, actor: "Charge Nurse Rana" }),
    demoEvent("vitals", 4, { bp: "148/92", hr: 104, rr: 22, spo2: 96, temp: "37.1", painScore: 7, gcs: 15, actor: "Nurse Karim Haddad" }),
    demoEvent("assessment", 10, {
      symptoms: "Central pressure-like chest pain radiating to the left shoulder with mild dyspnea and nausea.",
      medicalHistory: "Hypertension and GERD. No diabetes, smoking, prior coronary disease, or recent immobilization.",
      examination: "Alert, mildly anxious. Heart sounds normal, lungs clear, equal pulses, no edema or chest-wall tenderness.",
      impression: "Moderate-risk chest pain; acute coronary syndrome must be excluded",
      plan: "Cardiac monitoring, serial ECG and high-sensitivity troponin, CBC/CMP, chest radiograph, aspirin, and reassessment.",
      actor: "Dr. Lina Khoury",
    }),
    demoEvent("order", 12, { orderType: "procedure", name: "12-lead ECG", details: "Perform within 10 minutes and repeat with recurrent pain", priority: "stat", actor: "Dr. Lina Khoury", status: "ordered" }, orders.ecg),
    demoEvent("order", 13, { orderType: "laboratory", name: "High-sensitivity troponin", details: "Baseline and repeat at 2 hours", priority: "stat", actor: "Dr. Lina Khoury", status: "ordered" }, orders.troponin),
    demoEvent("order", 14, { orderType: "laboratory", name: "CBC and comprehensive metabolic panel", details: "CBC, electrolytes, renal function, glucose", priority: "urgent", actor: "Dr. Lina Khoury", status: "ordered" }, orders.labs),
    demoEvent("order", 15, { orderType: "imaging", name: "Portable chest radiograph", details: "Evaluate acute chest pain and dyspnea", priority: "urgent", actor: "Dr. Lina Khoury", status: "ordered" }, orders.xray),
    demoEvent("order", 16, { orderType: "medication", name: "Aspirin 324 mg PO", details: "Chew once now after allergy check", priority: "stat", actor: "Dr. Lina Khoury", status: "ordered" }, orders.medication),
    demoEvent("treatment", 18, { name: "Aspirin administered", details: "324 mg chewed; medication rights and allergy status verified", actor: "Nurse Karim Haddad", orderId: orders.medication }),
    demoEvent("treatment", 19, { name: "Cardiac monitoring and IV access", details: "Continuous telemetry; 18G IV placed in right antecubital fossa", actor: "Nurse Karim Haddad", orderId: null }),
    demoEvent("result", 22, { orderId: orders.ecg, result: "Normal sinus rhythm at 88 bpm; normal axis and intervals; no acute ST-T ischemic changes.", actor: "Dr. Lina Khoury", critical: false, verified: true }),
    demoEvent("order_status", 23, { orderId: orders.ecg, status: "completed", actor: "Dr. Lina Khoury", reason: "ECG reviewed and signed" }),
    demoEvent("result", 37, { orderId: orders.labs, result: "CBC and metabolic panel within reference range; creatinine 0.8 mg/dL, potassium 4.1 mmol/L.", actor: "Lab Technologist Salma N.", critical: false, verified: true }),
    demoEvent("order_status", 38, { orderId: orders.labs, status: "completed", actor: "Lab Technologist Salma N.", reason: "Verified results available" }),
    demoEvent("result", 42, { orderId: orders.troponin, result: "High-sensitivity troponin I: 4 ng/L (within reference range). Repeat specimen scheduled.", actor: "Lab Technologist Salma N.", critical: false, verified: true }),
    demoEvent("order_status", 43, { orderId: orders.troponin, status: "completed", actor: "Lab Technologist Salma N.", reason: "Baseline result verified" }),
    demoEvent("result", 47, { orderId: orders.xray, result: "No focal air-space disease, pleural effusion, or pneumothorax. Cardiomediastinal silhouette normal.", actor: "Dr. Nadim Aoun, Radiology", critical: false, verified: true }),
    demoEvent("order_status", 48, { orderId: orders.xray, status: "completed", actor: "Dr. Nadim Aoun", reason: "Final radiology report issued" }),
    demoEvent("order_status", 49, { orderId: orders.medication, status: "completed", actor: "Nurse Karim Haddad", reason: "Dose administered" }),
    demoEvent("vitals", 54, { bp: "126/78", hr: 82, rr: 16, spo2: 98, temp: "37.0", painScore: 1, gcs: 15, actor: "Nurse Karim Haddad" }),
    demoEvent("re_triage", 58, { previousLevel: 2, level: 3, algorithm: "esi", note: triages[1].note, actor: "Nurse Karim Haddad" }),
    demoEvent("reassessment", 61, { response: "improved", painScore: 1, notes: "Chest pressure nearly resolved. No dyspnea or nausea; repeat examination remains normal.", actor: "Dr. Lina Khoury" }),
    demoEvent("note", 64, { text: "Patient and spouse updated regarding reassuring initial results and need for serial troponin observation.", actor: "Dr. Lina Khoury" }),
    demoEvent("disposition", 68, { disposition: "observation", status: "decision_recorded", actor: "Dr. Lina Khoury", details: "Continue telemetry and obtain repeat ECG/troponin before final disposition." }),
    demoEvent("disposition_status", 72, { status: "monitoring_started", actor: "Nurse Karim Haddad", details: "Observation protocol initiated; repeat tests scheduled.", closesEncounter: false }),
  ];

  await db.transaction(
    "rw",
    [db.patients, db.encounters, db.triageAssessments, db.clinicalEvents, db.locationAssignments, db.auditEvents, db.beds],
    async () => {
      await db.patients.put(patient);
      await db.encounters.put(encounter);
      await db.triageAssessments.where("encounterId").equals(PERFECT_DEMO_ENCOUNTER_ID).delete();
      await db.triageAssessments.bulkAdd(triages);
      await db.clinicalEvents.where("encounterId").equals(PERFECT_DEMO_ENCOUNTER_ID).delete();
      await db.clinicalEvents.bulkAdd(events);
      await db.locationAssignments.where("encounterId").equals(PERFECT_DEMO_ENCOUNTER_ID).delete();
      await db.locationAssignments.add({
        id: "demo-perfect-location",
        encounterId: PERFECT_DEMO_ENCOUNTER_ID,
        locationName,
        zone,
        assignedAt: at(3),
        releasedAt: null,
      });
      if (bed) await db.beds.update(bed.id, { encounterId: PERFECT_DEMO_ENCOUNTER_ID });

      await db.auditEvents.where("entityId").equals(PERFECT_DEMO_ENCOUNTER_ID).delete();
      await db.auditEvents.bulkAdd([
        demoAudit("registered", "Complete identity and encounter created", at(0), "Registrar Hala"),
        demoAudit("triage_recorded", "ESI 2 - high-risk chest pain", at(5), "Nurse Karim Haddad"),
        demoAudit("assessment_recorded", "Moderate-risk chest pain assessment completed", at(10), "Dr. Lina Khoury"),
        demoAudit("orders_placed", "ECG, serial troponin, laboratory panel, chest radiograph, and aspirin", at(16), "Dr. Lina Khoury"),
        demoAudit("results_reviewed", "Initial cardiac workup reviewed; no critical abnormality", at(50), "Dr. Lina Khoury"),
        demoAudit("disposition_decided", "Observation protocol initiated", at(68), "Dr. Lina Khoury"),
      ]);
    },
  );

  function demoEvent(type: ClinicalEvent["type"], minutes: number, content: Record<string, unknown>, id?: string): ClinicalEvent {
    return {
      id: id ?? `demo-perfect-${type}-${minutes}`,
      encounterId: PERFECT_DEMO_ENCOUNTER_ID,
      type,
      content,
      attachmentBlob: null,
      recordedAt: at(minutes),
    };
  }

  function demoAudit(action: string, newValue: string, timestamp: number, actor: string) {
    return {
      id: `demo-perfect-audit-${action}`,
      entityType: "encounter",
      entityId: PERFECT_DEMO_ENCOUNTER_ID,
      action,
      previousValue: null,
      newValue,
      timestamp,
      mode: "normal" as const,
      actor,
    };
  }
}

async function ensureClinicalFoundationSeeds() {
  await db.transaction("rw", db.referenceRanges, db.vitalsSchedules, async () => {
    for (const range of DEFAULT_REFERENCE_RANGES) await db.referenceRanges.put(range);
    for (const schedule of DEFAULT_VITALS_SCHEDULES) await db.vitalsSchedules.put(schedule);
  });

  const patients = await db.patients.toArray();
  const normalPatients = patients.filter((patient) => !patient.displayNumber.startsWith("#B-"));
  for (const patient of normalPatients) {
    const updates: Partial<Patient> = {};
    if (patient.registrationComplete === undefined) updates.registrationComplete = Boolean(patient.name && patient.phone);
    if (!patient.catastropheTags) updates.catastropheTags = [];
    if (patient.mergedIntoPatientId === undefined) updates.mergedIntoPatientId = null;
    if (patient.mergedAt === undefined) updates.mergedAt = null;
    if (patient.mergeUndoneAt === undefined) updates.mergeUndoneAt = null;
    if (Object.keys(updates).length) await db.patients.update(patient.id, updates);
    if (patient.mrn) await ensureIdentifier(patient.id, "mrn", patient.mrn, patient.createdAt);
    if (patient.nationalId) await ensureIdentifier(patient.id, "national_id", patient.nationalId, patient.createdAt);
  }

  const demos = [
    patientSeed("clinical-karim-salem", "Karim Salem", "1986-03-12", "male", "+961 70 410 111", "1986-0312-4421", "Beirut", "Chest tightness"),
    patientSeed("clinical-karem-salim", "Karem Salim", "1986-09-02", "male", "+961 71 410 111", null, "Beirut", "Palpitations"),
    patientSeed("clinical-nadine-haddad", "Nadine Haddad", "1994-11-22", "female", "+961 76 222 501", "1994-1122-8041", "Mount Lebanon", "Shortness of breath"),
    patientSeed("clinical-george-matta", "George Matta", "1959-01-08", "male", "+961 03 889 120", "1959-0108-1188", "North", "Fever and cough"),
    patientSeed("clinical-sara-daou", "Sara Daou", "1978-05-17", "female", "+961 81 440 908", "1978-0517-9002", "Beqaa", "Abdominal pain"),
    patientSeed("clinical-omar-rahhal", "Omar Rahhal", "2001-08-29", "male", "+961 70 884 219", "2001-0829-6442", "South", "Ankle injury"),
    patientSeed("clinical-joyce-aoun", "Joyce Aoun", "1967-07-03", "female", "+961 79 113 556", "1967-0703-1775", "Nabatieh", "Dizziness"),
    patientSeed("clinical-hassan-zein", "Hassan Zein", "1981-02-19", "male", "+961 76 909 233", "1981-0219-5530", "Akkar", "Back pain"),
    patientSeed("clinical-rana-khoury", "Rana Khoury", "1990-06-14", "female", "+961 03 155 550", "1990-0614-7701", "Baalbek-Hermel", "Migraine"),
    patientSeed("clinical-elie-sarkis", "Elie Sarkis", "1972-12-27", "male", "+961 71 762 302", "1972-1227-3334", "Keserwan-Jbeil", "Laceration"),
    patientSeed("clinical-duplicate-source", "Karim Salem", "1986-03-12", "male", "+961 70 410 112", null, "Beirut", "Duplicate record demo"),
  ];

  for (const seed of demos) await ensureSeedPatient(seed);

  await ensureQuickSeed("clinical-quick-unknown", "Unknown male ~30", "male", "18-30", "Blast debris eye irritation");
  await ensureQuickSeed("clinical-quick-layal", "Layal K.", "female", "31-50", "Fever after travel");

  const activeEncounters = await db.encounters.toArray();
  for (const encounter of activeEncounters) {
    const existing = await db.vitalsSets.where("encounterId").equals(encounter.id).count();
    if (existing > 0) continue;
    const triage = (await db.triageAssessments.where("encounterId").equals(encounter.id).sortBy("performedAt")).at(-1)?.level;
    const base = typeof triage === "number" && triage <= 2
      ? { rr: 22, spo2: 94, hr: 104, sbp: 112, temp: 37.6 }
      : { rr: 16, spo2: 98, hr: 78, sbp: 122, temp: 36.9 };
    await addSeedVitals(encounter.id, encounter.patientId, encounter.arrivedAt + 6 * 60 * 1000, base);
  }

  const deteriorating = await db.encounters.where("patientId").equals("clinical-nadine-haddad").first();
  if (deteriorating) {
    await db.vitalsSets.where("encounterId").equals(deteriorating.id).delete();
    await addSeedVitals(deteriorating.id, deteriorating.patientId, Date.now() - 80 * 60 * 1000, { rr: 20, spo2: 96, hr: 92, sbp: 116, temp: 37.8 });
    await addSeedVitals(deteriorating.id, deteriorating.patientId, Date.now() - 42 * 60 * 1000, { rr: 24, spo2: 93, hr: 108, sbp: 104, temp: 38.5 });
    await addSeedVitals(deteriorating.id, deteriorating.patientId, Date.now() - 8 * 60 * 1000, { rr: 28, spo2: 91, hr: 122, sbp: 96, temp: 39.2, o2: true });
  }
}

// Seed the fully-scripted demo patient with rows in every first-class domain
// table so each chart tab shows realistic data out of the box. Idempotent:
// keyed by deterministic ids so re-runs replace rather than duplicate.
async function ensureDomainSeeds() {
  const patientId = PERFECT_DEMO_PATIENT_ID;
  const encounterId = PERFECT_DEMO_ENCOUNTER_ID;
  const patient = await db.patients.get(patientId);
  if (!patient) return;
  const now = Date.now();
  const daysAgo = (d: number) => now - d * 24 * 60 * 60 * 1000;
  const minsAgo = (m: number) => now - m * 60 * 1000;

  const medications: MedicationRecord[] = [
    { id: "demo-med-1", patientId, encounterId: null, name: "Amlodipine", dose: "5 mg", route: "PO", frequency: "Once daily", status: "active", startedAt: daysAgo(400), stoppedAt: null, prescriber: "Dr. Lina Khoury", notes: "For hypertension", createdAt: daysAgo(400) },
    { id: "demo-med-2", patientId, encounterId: null, name: "Omeprazole", dose: "20 mg", route: "PO", frequency: "Once daily", status: "active", startedAt: daysAgo(210), stoppedAt: null, prescriber: "Dr. Nadim Aoun", notes: "For GERD", createdAt: daysAgo(210) },
    { id: "demo-med-3", patientId, encounterId, name: "Aspirin", dose: "324 mg", route: "PO", frequency: "STAT", status: "active", startedAt: minsAgo(74), stoppedAt: null, prescriber: "Dr. Lina Khoury", notes: "Given in ER for chest pain", createdAt: minsAgo(74) },
    { id: "demo-med-4", patientId, encounterId: null, name: "Ibuprofen", dose: "400 mg", route: "PO", frequency: "PRN", status: "past", startedAt: daysAgo(600), stoppedAt: daysAgo(560), prescriber: "Dr. Sara Daou", notes: "Course completed", createdAt: daysAgo(600) },
  ];

  const allergyRecords: AllergyRecord[] = [
    { id: "demo-allergy-1", encounterId, patientId, substance: "Penicillin", reaction: "Urticaria", severity: "moderate", status: "active", notedAt: daysAgo(500), actor: "Dr. Lina Khoury" },
  ];

  const conditions: ConditionRecord[] = [
    { id: "demo-cond-1", patientId, encounterId: null, name: "Hypertension", category: "Cardiovascular", onsetDate: "2022-05-01", status: "chronic", notes: "Well controlled on amlodipine", createdAt: daysAgo(400) },
    { id: "demo-cond-2", patientId, encounterId: null, name: "Gastroesophageal reflux disease", category: "Gastrointestinal", onsetDate: "2023-02-14", status: "active", notes: null, createdAt: daysAgo(210) },
  ];

  const orderRecords: OrderRecord[] = [
    { id: "demo-order-1", encounterId, patientId, orderType: "procedure", name: "12-lead ECG", details: "Perform within 10 minutes", priority: "stat", status: "completed", orderedAt: minsAgo(80), actor: "Dr. Lina Khoury" },
    { id: "demo-order-2", encounterId, patientId, orderType: "laboratory", name: "High-sensitivity troponin", details: "Baseline and 2h repeat", priority: "stat", status: "result_available", orderedAt: minsAgo(79), actor: "Dr. Lina Khoury" },
    { id: "demo-order-3", encounterId, patientId, orderType: "imaging", name: "Portable chest radiograph", details: "Evaluate chest pain and dyspnea", priority: "urgent", status: "completed", orderedAt: minsAgo(77), actor: "Dr. Lina Khoury" },
  ];

  const resultRecords: ResultRecord[] = [
    { id: "demo-result-1", encounterId, patientId, orderId: "demo-order-2", name: "Troponin I (hs)", value: "4", unit: "ng/L", referenceRange: "<14", flag: "normal", resultedAt: minsAgo(50), verifiedBy: "Lab Technologist Salma N." },
    { id: "demo-result-2", encounterId, patientId, orderId: null, name: "Hemoglobin", value: "13.4", unit: "g/dL", referenceRange: "12.0-16.0", flag: "normal", resultedAt: minsAgo(48), verifiedBy: "Lab Technologist Salma N." },
    { id: "demo-result-3", encounterId, patientId, orderId: null, name: "Potassium", value: "4.1", unit: "mmol/L", referenceRange: "3.5-5.0", flag: "normal", resultedAt: minsAgo(48), verifiedBy: "Lab Technologist Salma N." },
  ];

  const immunizations: ImmunizationRecord[] = [
    { id: "demo-imm-1", patientId, encounterId: null, vaccine: "Tetanus (Td/Tdap)", dose: "Booster", date: "2021-09-12", site: "Left deltoid", lot: "TD-4471", provider: "Community clinic", status: "administered", createdAt: daysAgo(1000) },
    { id: "demo-imm-2", patientId, encounterId: null, vaccine: "Influenza", dose: "Seasonal", date: "2024-10-03", site: "Right deltoid", lot: "FLU-2210", provider: "Dr. Nadim Aoun", status: "administered", createdAt: daysAgo(280) },
  ];

  const procedures: ProcedureRecord[] = [
    { id: "demo-proc-1", encounterId, patientId, name: "IV cannulation", category: "Vascular access", performedAt: minsAgo(72), operator: "Nurse Karim Haddad", site: "Right antecubital fossa", outcome: "18G IV placed, patent", notes: null, createdAt: minsAgo(72) },
  ];

  const programs: ProgramRecord[] = [
    { id: "demo-prog-1", patientId, encounterId: null, name: "Hypertension follow-up", type: "chronic-care", enrolledAt: daysAgo(380), status: "active", coordinator: "Dr. Lina Khoury", notes: "Quarterly review", createdAt: daysAgo(380) },
  ];

  const billingItems: BillingItem[] = [
    { id: "demo-bill-1", encounterId, patientId, code: "ER-CONS", description: "Emergency consultation", category: "Consultation", amount: 120, status: "billed", createdAt: minsAgo(80) },
    { id: "demo-bill-2", encounterId, patientId, code: "IMG-CXR", description: "Chest radiograph", category: "Imaging", amount: 80, status: "pending", createdAt: minsAgo(77) },
    { id: "demo-bill-3", encounterId, patientId, code: "LAB-CMP", description: "Comprehensive metabolic panel", category: "Laboratory", amount: 45, status: "pending", createdAt: minsAgo(79) },
  ];

  const attachments: Attachment[] = [
    { id: "demo-att-1", encounterId, patientId, title: "ECG tracing", category: "imaging", fileName: "ecg-12lead.pdf", mimeType: "application/pdf", blob: null, uploadedAt: minsAgo(70), uploadedBy: "Dr. Lina Khoury" },
    { id: "demo-att-2", encounterId, patientId, title: "Insurance card", category: "document", fileName: "insurance.jpg", mimeType: "image/jpeg", blob: null, uploadedAt: minsAgo(85), uploadedBy: "Registrar Hala" },
  ];

  await db.transaction(
    "rw",
    [db.medications, db.allergyRecords, db.conditions, db.orderRecords, db.resultRecords, db.immunizations, db.procedures, db.programs, db.billingItems, db.attachments],
    async () => {
      await db.medications.bulkPut(medications);
      await db.allergyRecords.bulkPut(allergyRecords);
      await db.conditions.bulkPut(conditions);
      await db.orderRecords.bulkPut(orderRecords);
      await db.resultRecords.bulkPut(resultRecords);
      await db.immunizations.bulkPut(immunizations);
      await db.procedures.bulkPut(procedures);
      await db.programs.bulkPut(programs);
      await db.billingItems.bulkPut(billingItems);
      await db.attachments.bulkPut(attachments);
    },
  );
}

async function ensureRegistrationProfileSeed() {
  const patientId = "mock-master-maya-haddad";
  const encounterId = "mock-master-maya-haddad-encounter";
  const existing = await db.patients.get(patientId);
  const now = Date.now();
  const arrivedAt = now - 2 * 60 * 60 * 1000;

  const patient: Patient = {
    id: patientId,
    displayNumber: "#MOCK-REG-001",
    mrn: "MRN-2026-000174",
    patientType: "standard",
    confidentialityLevel: "normal",
    title: "Ms.",
    secondaryMrn: null,
    name: "Maya Nabil Haddad",
    firstNameEn: "Maya",
    middleNameEn: "Nabil",
    lastNameEn: "Haddad",
    fourthNameEn: null,
    firstNameAr: "Maya",
    middleNameAr: "Nabil",
    lastNameAr: "Haddad",
    fourthNameAr: null,
    motherNameEn: "Rima Khoury",
    motherNameAr: "Rima Khoury",
    maidenName: null,
    spouseNameEn: "Karim Nassar",
    spouseNameAr: "Karim Nassar",
    dateOfBirth: "1990-04-18",
    ageValue: 36,
    ageUnit: "years",
    ageCalculated: true,
    sex: "female",
    sexAtBirth: "female",
    genderIdentity: null,
    phone: "+961 71 555 284",
    mobileSecondary: "+961 76 555 917",
    homePhone: "+961 1 555 462",
    workPhone: "+961 1 555 833",
    fax: null,
    preferredContactMethod: "mobile",
    mayReceiveSms: true,
    mayReceiveEmail: true,
    communicationNotes: "Mock development patient only.",
    nationalId: "MOCK-LB-784512",
    email: "maya.haddad@example.test",
    address: "Lebanon | Beirut | Beirut | Beirut | Mock Cedar Street | Cedar Building",
    addressCountry: "Lebanon",
    addressGovernorate: "Beirut",
    addressDistrict: "Beirut",
    addressCity: "Beirut",
    addressVillage: null,
    addressZone: "Achrafieh",
    addressArea: "Sassine",
    addressStreet: "Mock Cedar Street",
    addressBuilding: "Cedar Building",
    addressFloor: "4",
    addressAdditionalDetails: "Opposite the public garden",
    placeOfBirthCountry: "Lebanon",
    placeOfBirthGovernorate: "Beirut",
    placeOfBirthDistrict: "Beirut",
    placeOfBirthCity: "Beirut",
    placeOfBirthVillage: null,
    placeOfBirthLocality: "Achrafieh",
    city: "Beirut",
    nationality: "Lebanese",
    maritalStatus: "married",
    preferredLanguage: "Arabic",
    emergencyContact: "Rima Khoury Haddad | mother | +961 70 555 121",
    emergencyContactName: "Rima Khoury Haddad",
    emergencyContactRelationship: "mother",
    emergencyContactPhone: "+961 70 555 121",
    insurance: "Cedar Health Plan | CHP-784512",
    insuranceProvider: "Cedar Health Plan",
    insurancePolicyNumber: "POL-MOCK-2026-147",
    defaultInsuranceId: "mock-ins-maya-default",
    bloodGroup: "O+",
    vip: false,
    deceased: false,
    deceasedDate: null,
    religion: null,
    representativeGuardianName: null,
    knownConditions: [],
    currentMedications: [],
    photoBlob: null,
    identityStatus: "confirmed",
    estimatedAgeRange: null,
    registrationComplete: true,
    duplicateOverride: false,
    catastropheTags: [],
    mergedIntoPatientId: null,
    mergedAt: null,
    mergeUndoneAt: null,
    createdAt: arrivedAt,
  };

  const encounter: Encounter = {
    id: encounterId,
    caseNumber: "ER-2026-MOCK-0174",
    patientId,
    incidentId: null,
    modeAtCreation: "normal",
    pathway: "standard",
    arrivedAt,
    state: "registered",
    disposition: null,
    closedAt: null,
    chiefComplaint: "Mock registration profile review",
    arrivalMethod: "walk_in",
    referralSource: "Development seed",
    allergies: [],
    currentLocationName: null,
    currentZone: null,
    currentProvider: null,
    updatedAt: now,
  };

  const identifiers: PatientIdentifier[] = [
    { id: "mock-id-maya-mrn", patientId, type: "mrn", value: "MRN-2026-000174", issuingCountry: "Lebanon", issueDate: "2026-01-01", expiryDate: null, isPrimary: true, verificationStatus: "verified", verifiedBy: "Development seed", verificationDate: "2026-01-01", frontImageBlob: null, backImageBlob: null, notes: "Mock MRN", createdAt: arrivedAt },
    { id: "mock-id-maya-national", patientId, type: "national_id", value: "MOCK-LB-784512", issuingCountry: "Lebanon", issueDate: null, expiryDate: null, isPrimary: true, verificationStatus: "verified", verifiedBy: "Development seed", verificationDate: "2026-01-01", frontImageBlob: null, backImageBlob: null, notes: "Fictional national ID", createdAt: arrivedAt },
    { id: "mock-id-maya-passport", patientId, type: "passport", value: "P-MOCK-458721", issuingCountry: "Lebanon", issueDate: null, expiryDate: "2030-08-10", isPrimary: false, verificationStatus: "verified", verifiedBy: "Development seed", verificationDate: "2026-01-01", frontImageBlob: null, backImageBlob: null, notes: "Fictional passport", createdAt: arrivedAt },
  ];

  const relatedPersons: RelatedPerson[] = [
    { id: "mock-rel-maya-mother", patientId, fullName: "Rima Khoury Haddad", englishName: "Rima Khoury Haddad", arabicName: null, relationship: "mother", mobilePrimary: "+961 70 555 121", mobileSecondary: null, email: null, address: "Beirut, Lebanon", nationalId: null, isEmergencyContact: true, isNextOfKin: true, isSpouse: false, isParent: true, isLegalGuardian: false, isAuthorizedRepresentative: false, preferredContactMethod: "mobile", contactPriority: 1, notes: "Mock next of kin", createdAt: arrivedAt, updatedAt: now },
    { id: "mock-rel-maya-spouse", patientId, fullName: "Karim Nassar", englishName: "Karim Nassar", arabicName: null, relationship: "spouse", mobilePrimary: "+961 71 555 882", mobileSecondary: null, email: null, address: null, nationalId: null, isEmergencyContact: true, isNextOfKin: false, isSpouse: true, isParent: false, isLegalGuardian: false, isAuthorizedRepresentative: false, preferredContactMethod: "mobile", contactPriority: 2, notes: "Mock spouse", createdAt: arrivedAt, updatedAt: now },
    { id: "mock-rel-maya-reference", patientId, fullName: "Nabil Haddad", englishName: "Nabil Haddad", arabicName: null, relationship: "father", mobilePrimary: "+961 76 555 330", mobileSecondary: null, email: null, address: null, nationalId: null, isEmergencyContact: false, isNextOfKin: false, isSpouse: false, isParent: true, isLegalGuardian: false, isAuthorizedRepresentative: false, preferredContactMethod: "mobile", contactPriority: 3, notes: "Mock secondary reference", createdAt: arrivedAt, updatedAt: now },
  ];

  const insurance: InsurancePolicy = {
    id: "mock-ins-maya-default",
    patientId,
    payerId: "INS-MOCK-001",
    payerName: "Cedar Health Plan",
    plan: null,
    membershipNumber: "CHP-784512",
    policyNumber: "POL-MOCK-2026-147",
    coverageClass: null,
    subscriberRelationship: null,
    subscriberName: null,
    subscriberId: null,
    effectiveDate: null,
    expiryDate: "2027-12-31",
    isDefault: true,
    approvalRequired: false,
    notes: "Mock development insurance policy.",
    cardImageBlob: null,
    createdAt: arrivedAt,
    updatedAt: now,
  };

  const registry: CivilRegistryRecord = {
    id: "mock-civil-maya",
    patientId,
    sijilNumber: "214",
    sahifaNumber: "88",
    daira: "Achrafieh",
    registryCountry: "Lebanon",
    registryGovernorate: "Beirut",
    registryDistrict: "Beirut",
    registryLocality: "Achrafieh",
    registryNotes: "Mock civil registry data.",
    updatedAt: now,
  };

  const employment: EmploymentRecord = {
    id: "mock-employment-maya",
    patientId,
    occupation: "Software Engineer",
    employmentStatus: "employed",
    employer: "Cedar Systems SAL",
    jobTitle: null,
    workPhone: "+961 1 555 833",
    workAddress: "Beirut Digital District",
    industry: "Technology",
    notes: "Mock employment data.",
    updatedAt: now,
  };

  const military: MilitaryRecord = {
    id: "mock-military-maya",
    patientId,
    enabled: false,
    institution: null,
    section: null,
    positionOrRank: null,
    serviceNumber: null,
    zone: null,
    notes: null,
    updatedAt: now,
  };

  const pendingCases: PendingCase[] = [
    { id: "mock-pending-maya-insurance", patientId, encounterId, caseNumber: "ER-2026-MOCK-0174", requestNumber: "REQ-MOCK-INS-001", requestDate: now - 50 * 60 * 1000, requestType: "Insurance review", pendingStatus: "pending_insurance", responsibleDepartment: "Billing", assignedOwner: "Mock Registrar", createdAt: now - 50 * 60 * 1000 },
    { id: "mock-pending-maya-documentation", patientId, encounterId, caseNumber: "ER-2026-MOCK-0174", requestNumber: "REQ-MOCK-DOC-002", requestDate: now - 35 * 60 * 1000, requestType: "Document verification", pendingStatus: "pending_documentation", responsibleDepartment: "Registration", assignedOwner: "Mock Registration Desk", createdAt: now - 35 * 60 * 1000 },
  ];

  await db.transaction(
    "rw",
    [db.patients, db.encounters, db.patientIdentifiers, db.relatedPersons, db.insurancePolicies, db.civilRegistryRecords, db.employmentRecords, db.militaryRecords, db.pendingCases, db.clinicalEvents],
    async () => {
      await db.patients.put(patient);
      if (!existing) {
        await db.encounters.put(encounter);
        await db.clinicalEvents.put({ id: "mock-master-maya-created", encounterId, type: "created", content: { mock: true, message: "Fictional registration profile development patient" }, attachmentBlob: null, recordedAt: arrivedAt });
      }
      await db.patientIdentifiers.bulkPut(identifiers);
      await db.relatedPersons.bulkPut(relatedPersons);
      await db.insurancePolicies.put(insurance);
      await db.civilRegistryRecords.put(registry);
      await db.employmentRecords.put(employment);
      await db.militaryRecords.put(military);
      await db.pendingCases.bulkPut(pendingCases);
    },
  );
}

function patientSeed(
  id: string,
  name: string,
  dob: string,
  sex: Patient["sex"],
  phone: string,
  nationalId: string | null,
  city: string,
  complaint: string,
) {
  return { id, name, dob, sex, phone, nationalId, city, complaint };
}

async function ensureSeedPatient(seed: ReturnType<typeof patientSeed>) {
  if (await db.patients.get(seed.id)) return;
  const now = Date.now() - randInt(20, 180) * 60 * 1000;
  const mrn = nextMrn();
  const patient: Patient = {
    id: seed.id,
    displayNumber: nextDisplayNumber("normal"),
    mrn,
    name: seed.name,
    dateOfBirth: seed.dob,
    sex: seed.sex,
    phone: seed.phone,
    nationalId: seed.nationalId,
    email: `${seed.name.toLowerCase().replace(/\s+/g, ".")}@example.test`,
    address: "Demo street, building 4",
    city: seed.city,
    nationality: "Lebanese",
    preferredLanguage: rand(["Arabic", "English", "French"]),
    emergencyContact: "Family contact | Relative | +961 70 100 200",
    emergencyContactName: "Family contact",
    emergencyContactRelationship: "Relative",
    emergencyContactPhone: "+961 70 100 200",
    knownConditions: rand([["Hypertension"], ["Asthma"], ["None known"]]),
    currentMedications: rand([["Amlodipine"], ["Salbutamol inhaler"], []]),
    photoBlob: null,
    identityStatus: "confirmed",
    estimatedAgeRange: null,
    registrationComplete: true,
    duplicateOverride: false,
    catastropheTags: seed.id === "clinical-karim-salem" ? ["#B-2999"] : [],
    mergedIntoPatientId: null,
    mergedAt: null,
    mergeUndoneAt: null,
    createdAt: now,
  };
  const encounter: Encounter = {
    id: `${seed.id}-encounter`,
    caseNumber: nextCaseNumber(),
    patientId: seed.id,
    incidentId: null,
    modeAtCreation: "normal",
    arrivedAt: now,
    state: "triaged",
    disposition: null,
    closedAt: null,
    chiefComplaint: seed.complaint,
    arrivalMethod: "walk_in",
    referralSource: null,
    allergies: [],
    currentLocationName: null,
    currentZone: null,
    currentProvider: null,
  };
  await db.patients.add(patient);
  await ensureIdentifier(patient.id, "mrn", mrn, now);
  if (seed.nationalId) await ensureIdentifier(patient.id, "national_id", seed.nationalId, now);
  for (const tag of patient.catastropheTags ?? []) await ensureIdentifier(patient.id, "catastrophe_tag", tag, now);
  await db.encounters.add(encounter);
  await db.triageAssessments.add({ id: uuid(), encounterId: encounter.id, algorithm: "esi", level: seed.id === "clinical-nadine-haddad" ? 2 : 3, performedAt: now + 3 * 60 * 1000, note: null });
  await db.clinicalEvents.add({ id: uuid(), encounterId: encounter.id, type: "created", content: { caseNumber: encounter.caseNumber, mrn }, attachmentBlob: null, recordedAt: now });
}

async function ensureQuickSeed(id: string, name: string, sex: Patient["sex"], band: string, complaint: string) {
  if (await db.patients.get(id)) return;
  const now = Date.now() - randInt(10, 90) * 60 * 1000;
  const mrn = nextMrn();
  const encounterId = `${id}-encounter`;
  await db.patients.add({
    id,
    displayNumber: nextDisplayNumber("normal"),
    mrn,
    name,
    dateOfBirth: null,
    sex,
    phone: null,
    photoBlob: null,
    identityStatus: "provisional",
    estimatedAgeRange: band,
    registrationComplete: false,
    duplicateOverride: false,
    catastropheTags: [],
    mergedIntoPatientId: null,
    mergedAt: null,
    mergeUndoneAt: null,
    createdAt: now,
  });
  await ensureIdentifier(id, "mrn", mrn, now);
  await db.encounters.add({
    id: encounterId,
    caseNumber: nextCaseNumber(),
    patientId: id,
    incidentId: null,
    modeAtCreation: "normal",
    arrivedAt: now,
    state: "registered",
    disposition: null,
    closedAt: null,
    chiefComplaint: complaint,
    arrivalMethod: "walk_in",
    referralSource: null,
    allergies: [],
    currentLocationName: null,
    currentZone: null,
    currentProvider: null,
  });
  await db.clinicalEvents.add({ id: uuid(), encounterId, type: "created", content: { registrationDepth: "quick", mrn }, attachmentBlob: null, recordedAt: now });
}

async function ensureIdentifier(patientId: string, type: PatientIdentifier["type"], value: string, createdAt: number) {
  const existing = await db.patientIdentifiers
    .where("value")
    .equals(value)
    .filter((identifier) => identifier.patientId === patientId && identifier.type === type)
    .first();
  if (!existing) await db.patientIdentifiers.add({ id: uuid(), patientId, type, value, createdAt });
}

async function addSeedVitals(
  encounterId: string,
  patientId: string,
  recordedAt: number,
  values: { rr: number; spo2: number; hr: number; sbp: number; temp: number; dbp?: number; o2?: boolean; avpu?: Avpu },
) {
  const existing = await db.vitalsSets
    .where("encounterId")
    .equals(encounterId)
    .filter((set) => set.recordedAt === recordedAt)
    .first();
  if (existing) return;
  const news = scoreNews2({
    respiratoryRate: values.rr,
    spo2: values.spo2,
    supplementalO2: Boolean(values.o2),
    temperature: values.temp,
    systolicBp: values.sbp,
    heartRate: values.hr,
    consciousness: values.avpu ?? "Alert",
  });
  const vitals: VitalsSet = {
    id: uuid(),
    encounterId,
    patientId,
    recordedAt,
    temperature: values.temp,
    heartRate: values.hr,
    respiratoryRate: values.rr,
    systolicBp: values.sbp,
    diastolicBp: values.dbp ?? Math.max(40, values.sbp - randInt(35, 55)),
    spo2: values.spo2,
    supplementalO2: Boolean(values.o2),
    consciousness: values.avpu ?? "Alert",
    painScore: randInt(0, 7),
    bloodGlucose: randInt(82, 160),
    weightKg: 72,
    heightCm: 172,
    bmi: calculateBmi(72, 172),
    gcsEye: 4,
    gcsVerbal: 5,
    gcsMotor: 6,
    gcsTotal: 15,
    news2: news.score,
    news2Breakdown: news.breakdown,
    implausibleFields: implausibleFields({ respiratoryRate: values.rr, spo2: values.spo2, heartRate: values.hr, systolicBp: values.sbp, temperature: values.temp }),
    source: "full",
  };
  await db.vitalsSets.add(vitals);
  await db.clinicalEvents.add({
    id: uuid(),
    encounterId,
    type: "vitals",
    content: { vitalsSetId: vitals.id, bp: `${vitals.systolicBp}/${vitals.diastolicBp}`, hr: values.hr, rr: values.rr, spo2: values.spo2, temp: values.temp, news2: news.score },
    attachmentBlob: null,
    recordedAt,
  });
}

export async function seedDemoIncident() {
  const now = Date.now();
  const incidentId = uuid();
  await db.incidents.add({
    id: incidentId,
    name: "Port district explosion",
    code: "PORT-B",
    activatedAt: now,
    deactivatedAt: null,
  });

  const colors: StartColor[] = ["red", "yellow", "green", "black"];
  const weights = [0.15, 0.3, 0.5, 0.05];

  function pickColor(): StartColor {
    const r = Math.random();
    let acc = 0;
    for (let i = 0; i < colors.length; i++) {
      acc += weights[i];
      if (r <= acc) return colors[i];
    }
    return "green";
  }

  const patients: Patient[] = [];
  const encounters: Encounter[] = [];
  const triages: TriageAssessment[] = [];
  const events: ClinicalEvent[] = [];
  const vitalsSets: VitalsSet[] = [];
  const reconItems: ReconciliationItem[] = [];

  let maxCounter = 2800;

  for (let i = 0; i < 40; i++) {
    const arrivedAt = now - randInt(1, 90) * 60 * 1000;
    const displayNumber = nextDisplayNumber("catastrophe");
    maxCounter = Math.max(maxCounter, Number(displayNumber.replace("#B-", "")));
    const patientId = uuid();
    const encounterId = uuid();
    const color = pickColor();

    const hasName = Math.random() > 0.7;

    const patient: Patient = {
      id: patientId,
      displayNumber,
      mrn: null,
      name: hasName ? rand(LEBANESE_NAMES) : null,
      dateOfBirth: null,
      sex: Math.random() > 0.5 ? rand(["male", "female"]) : null,
      phone: null,
      photoBlob: null,
      identityStatus: hasName ? "provisional" : "unknown",
      estimatedAgeRange: hasName ? null : rand(["20-30", "30-45", "45-60", "5-12", "60+"]),
      createdAt: arrivedAt,
    };

    const encounter: Encounter = {
      id: encounterId,
      caseNumber: displayNumber,
      patientId,
      incidentId,
      modeAtCreation: "catastrophe",
      arrivedAt,
      state: color === "black" ? "died_before_treatment" : "triaged",
      disposition: color === "black" ? "deceased" : null,
      closedAt: color === "black" ? arrivedAt : null,
      chiefComplaint: null,
      allergies: [],
      currentLocationName: Math.random() > 0.3 ? `Triage ${rand(["A", "B", "C"])}` : null,
      currentZone: Math.random() > 0.3 ? "zone-trauma" : null,
      currentProvider: null,
    };

    patients.push(patient);
    encounters.push(encounter);
    triages.push({
      id: uuid(),
      encounterId,
      algorithm: "start",
      level: color,
      performedAt: arrivedAt + 60 * 1000,
      note: null,
    });
    events.push({
      id: uuid(),
      encounterId,
      type: "created",
      content: { displayNumber, mode: "catastrophe" },
      attachmentBlob: null,
      recordedAt: arrivedAt,
    });

    if (i < 8 && color !== "black") {
      const sample = color === "red"
        ? { rr: 30, spo2: 90, hr: 128, sbp: 92, avpu: "Voice" as Avpu }
        : color === "yellow"
          ? { rr: 24, spo2: 94, hr: 108, sbp: 106, avpu: "Alert" as Avpu }
          : { rr: 18, spo2: 98, hr: 86, sbp: 124, avpu: "Alert" as Avpu };
      const news = scoreNews2({
        respiratoryRate: sample.rr,
        spo2: sample.spo2,
        supplementalO2: color === "red",
        temperature: null,
        systolicBp: sample.sbp,
        heartRate: sample.hr,
        consciousness: sample.avpu,
      });
      const vitalsId = uuid();
      vitalsSets.push({
        id: vitalsId,
        encounterId,
        patientId,
        recordedAt: arrivedAt + 2 * 60 * 1000,
        temperature: null,
        heartRate: sample.hr,
        respiratoryRate: sample.rr,
        systolicBp: sample.sbp,
        diastolicBp: null,
        spo2: sample.spo2,
        supplementalO2: color === "red",
        consciousness: sample.avpu,
        painScore: null,
        bloodGlucose: null,
        weightKg: null,
        heightCm: null,
        bmi: null,
        gcsEye: null,
        gcsVerbal: null,
        gcsMotor: null,
        gcsTotal: null,
        news2: news.score,
        news2Breakdown: news.breakdown,
        implausibleFields: [],
        source: "crisis",
      });
      events.push({
        id: uuid(),
        encounterId,
        type: "vitals",
        content: { vitalsSetId: vitalsId, hr: sample.hr, rr: sample.rr, spo2: sample.spo2, bp: sample.sbp, avpu: sample.avpu, news2: news.score, source: "crisis" },
        attachmentBlob: null,
        recordedAt: arrivedAt + 2 * 60 * 1000,
      });
    }

    const hasVoice = Math.random() > 0.75;
    const hasPhoto = Math.random() > 0.75;
    if (hasVoice) {
      events.push({
        id: uuid(),
        encounterId,
        type: "voice_note",
        content: { durationSec: randInt(8, 45) },
        attachmentBlob: null,
        recordedAt: arrivedAt + 4 * 60 * 1000,
      });
    }
    if (hasPhoto) {
      events.push({
        id: uuid(),
        encounterId,
        type: "photo",
        content: { placeholder: true },
        attachmentBlob: null,
        recordedAt: arrivedAt + 5 * 60 * 1000,
      });
    }

    await writeAudit({
      entityType: "encounter",
      entityId: encounterId,
      action: "created",
      newValue: displayNumber,
      mode: "catastrophe",
    });
  }

  seedCounters(0, maxCounter);

  await db.patients.bulkAdd(patients);
  await db.encounters.bulkAdd(encounters);
  await db.triageAssessments.bulkAdd(triages);
  await db.clinicalEvents.bulkAdd(events);
  if (vitalsSets.length) await db.vitalsSets.bulkAdd(vitalsSets);

  const issueTypes: ReconciliationItem["issueType"][] = [
    "unknown_identity",
    "paper_not_linked",
    "voice_unreviewed",
    "location_missing",
    "possible_duplicate",
    "registration_completion",
    "unknown_identity",
  ];

  const candidates = encounters.slice(0, 6);
  for (let i = 0; i < candidates.length; i++) {
    const enc = candidates[i];
    const pat = patients.find((p) => p.id === enc.patientId)!;
    reconItems.push({
      id: uuid(),
      encounterId: enc.id,
      issueType: issueTypes[i],
      status: "pending",
      paperNoteImage: "handwritten-placeholder",
      voiceNoteEventId: null,
      suggested: {
        identityMatch: hasNameGuess(i),
        estimatedAge: pat.estimatedAgeRange ?? rand(["20-30", "30-45", "45-60"]),
        triage: rand(["red", "yellow", "green"]),
        location: rand(["Triage A", "Triage B", "Trauma Bay 2", "Fast-track 3"]),
        extractedNote: extractedNoteFor(i),
      },
      createdAt: now,
    });
  }

  await db.reconciliationItems.bulkAdd(reconItems);

  return incidentId;
}

function hasNameGuess(i: number): string | null {
  const guesses = [
    "Possible match: Samir Aziz (72% confidence)",
    null,
    "Possible match: Dina Chalhoub (58% confidence)",
    null,
    "Possible match: Walid Nakhle (81% confidence)",
    null,
  ];
  return guesses[i % guesses.length];
}

function extractedNoteFor(i: number): string {
  const notes = [
    "Male, approx 30s. Shrapnel wound right leg. Conscious, alert. Given IV fluids on scene.",
    "Female, unresponsive on arrival, now conscious. Head laceration. c-collar applied.",
    "Male, walking wounded. Minor burns to forearms. Triaged green at scene.",
    "Female, approx 50s. Crush injury to left hand. Pain 8/10. Splinted.",
    "Male, chest pain and dyspnea, possible blast lung. O2 applied en route.",
    "Female, superficial lacerations, ambulatory, no LOC reported.",
  ];
  return notes[i % notes.length];
}
