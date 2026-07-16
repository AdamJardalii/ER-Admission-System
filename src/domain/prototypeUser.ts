export type DemoRole =
  | "registration_clerk"
  | "triage_nurse"
  | "ed_nurse"
  | "physician"
  | "charge_nurse"
  | "bed_manager"
  | "ed_director"
  | "administrator";

export interface DemoStaff {
  id: string;
  name: string;
  role: DemoRole;
  roleLabel: string;
}

export const DEMO_STAFF: readonly DemoStaff[] = [
  { id: "staff-reg-1", name: "Maya Nassar", role: "registration_clerk", roleLabel: "Registration Clerk" },
  { id: "staff-triage-1", name: "Rana Haddad", role: "triage_nurse", roleLabel: "Triage Nurse" },
  { id: "staff-nurse-1", name: "Omar Khalil", role: "ed_nurse", roleLabel: "ED Nurse" },
  { id: "staff-doctor-1", name: "Dr. Sami Rahal", role: "physician", roleLabel: "Physician" },
  { id: "staff-charge-1", name: "Nadine Saleh", role: "charge_nurse", roleLabel: "Charge Nurse" },
  { id: "staff-bed-1", name: "Karim Younes", role: "bed_manager", roleLabel: "Bed Manager" },
  { id: "staff-director-1", name: "Dr. Laila Daher", role: "ed_director", roleLabel: "ED Director" },
  { id: "staff-admin-1", name: "Tarek Mansour", role: "administrator", roleLabel: "Administrator" },
];

export const DEFAULT_DEMO_STAFF_ID = "staff-doctor-1";
export const DEMO_STAFF_STORAGE_KEY = "er-prototype-acting-staff";

export type DemoCapability =
  | "register_patient"
  | "record_triage"
  | "create_order"
  | "advance_order"
  | "review_result"
  | "manage_beds"
  | "view_reports"
  | "manage_prototype";

const ROLE_CAPABILITIES: Record<DemoRole, readonly DemoCapability[]> = {
  registration_clerk: ["register_patient"],
  triage_nurse: ["record_triage", "register_patient"],
  ed_nurse: ["record_triage", "create_order", "advance_order", "manage_beds"],
  physician: ["create_order", "advance_order", "review_result"],
  charge_nurse: ["record_triage", "create_order", "advance_order", "manage_beds", "view_reports"],
  bed_manager: ["manage_beds"],
  ed_director: ["create_order", "review_result", "manage_beds", "view_reports"],
  administrator: ["view_reports", "manage_prototype"],
};

export function demoStaffById(id: string | null | undefined) {
  return DEMO_STAFF.find((staff) => staff.id === id) ?? DEMO_STAFF.find((staff) => staff.id === DEFAULT_DEMO_STAFF_ID)!;
}

export function loadDemoStaffId() {
  if (typeof window === "undefined") return DEFAULT_DEMO_STAFF_ID;
  return demoStaffById(window.localStorage.getItem(DEMO_STAFF_STORAGE_KEY)).id;
}

export function saveDemoStaffId(id: string) {
  const staff = demoStaffById(id);
  if (typeof window !== "undefined") window.localStorage.setItem(DEMO_STAFF_STORAGE_KEY, staff.id);
  return staff;
}

export function getStoredDemoStaff() {
  return demoStaffById(loadDemoStaffId());
}

export function resolvePrototypeActor(explicitActor?: string | null) {
  const genericActors = new Set([
    "",
    "demo provider",
    "current clinician",
    "charge nurse",
    "triage nurse",
    "registrar",
    "incident team",
    "results service",
    "system",
  ]);
  const selected = getStoredDemoStaff();
  if (!explicitActor || genericActors.has(explicitActor.trim().toLowerCase())) {
    return { actorId: selected.id, actorName: selected.name, demoRole: selected.role };
  }
  return { actorId: null, actorName: explicitActor.trim(), demoRole: null };
}

export function demoRoleCan(role: DemoRole, capability: DemoCapability) {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function defaultPathForDemoRole(role: DemoRole) {
  if (role === "registration_clerk") return "/patients";
  if (role === "triage_nurse" || role === "ed_nurse") return "/queue";
  if (role === "physician") return "/orders";
  if (role === "bed_manager") return "/beds";
  if (role === "administrator") return "/prototype-settings";
  return "/";
}
