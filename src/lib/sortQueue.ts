import type { EncounterView } from "../db/hooks";
import { triageRank, waitMinutes, isOverdue } from "./triage";

export function sortQueue(views: EncounterView[]): EncounterView[] {
  return [...views].sort((a, b) => {
    const rankDiff = triageRank(a.triage) - triageRank(b.triage);
    if (rankDiff !== 0) return rankDiff;

    const aOverdue = isOverdue(a.triage, a.encounter.arrivedAt);
    const bOverdue = isOverdue(b.triage, b.encounter.arrivedAt);
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;

    if (aOverdue && bOverdue) {
      const waitDiff = waitMinutes(b.encounter.arrivedAt) - waitMinutes(a.encounter.arrivedAt);
      if (waitDiff !== 0) return waitDiff;
    }

    return a.encounter.arrivedAt - b.encounter.arrivedAt;
  });
}
