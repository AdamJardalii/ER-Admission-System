let normalCounter = 800;
let catastropheCounter = 2800;
let mrnCounter = 100000;
let caseCounter = 5000;

export function nextDisplayNumber(mode: "normal" | "catastrophe"): string {
  if (mode === "catastrophe") {
    catastropheCounter += 1;
    return `#B-${catastropheCounter}`;
  }
  normalCounter += 1;
  return `#${normalCounter}`;
}

export function seedCounters(normalMax: number, catastropheMax: number) {
  normalCounter = Math.max(normalCounter, normalMax);
  catastropheCounter = Math.max(catastropheCounter, catastropheMax);
}

export function nextMrn(): string {
  mrnCounter += 1;
  return `MRN-${String(mrnCounter).padStart(6, "0")}`;
}

export function nextCaseNumber(year = new Date().getFullYear()): string {
  caseCounter += 1;
  return `ER-${year}-${String(caseCounter).padStart(5, "0")}`;
}

export function seedIdentityCounters(mrnMax: number, caseMax: number) {
  mrnCounter = Math.max(mrnCounter, mrnMax);
  caseCounter = Math.max(caseCounter, caseMax);
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
