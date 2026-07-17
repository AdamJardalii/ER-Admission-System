import { useMemo, type ComponentType } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  ClipboardList,
  Clock3,
  FileText,
  FlaskConical,
  HeartPulse,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Signpost,
  Stethoscope,
  TestTube2,
} from "lucide-react";
import { useClinicalEvents, useEncounterView, useTriageAssessments } from "../db/hooks";
import { workflowStatusForEncounter } from "../domain/encounterStateMachine";
import type { ClinicalEvent, ClinicalEventType } from "../types";

type JourneyIcon = ComponentType<{ size?: number; className?: string }>;

interface JourneyStage {
  key: string;
  label: string;
  icon: JourneyIcon;
  timestamp: number | null;
  count?: number;
}

interface JourneyItem {
  id: string;
  type: string;
  label: string;
  detail: string;
  actor: string | null;
  timestamp: number;
  icon: JourneyIcon;
  tone: "primary" | "green" | "yellow" | "red" | "neutral";
}

export function PatientJourney({ encounterId }: { encounterId: string }) {
  const view = useEncounterView(encounterId);
  const events = useClinicalEvents(encounterId);
  const triages = useTriageAssessments(encounterId);

  const journey = useMemo(() => {
    if (!view) return { stages: [] as JourneyStage[], items: [] as JourneyItem[] };
    const chronologicalEvents = [...events].sort((a, b) => a.recordedAt - b.recordedAt);
    const chronologicalTriage = [...triages].sort((a, b) => a.performedAt - b.performedAt);
    const eventsOf = (...types: ClinicalEventType[]) => chronologicalEvents.filter((event) => types.includes(event.type));
    const firstAt = (...types: ClinicalEventType[]) => eventsOf(...types)[0]?.recordedAt ?? null;
    const firstStatusAt = (...statuses: string[]) => chronologicalEvents.find((event) => {
      if (event.type !== "state_transition") return false;
      const content = (event.content ?? {}) as Record<string, unknown>;
      return statuses.includes(String(content.toStatus ?? ""));
    })?.recordedAt ?? null;
    const dispositionAt = firstAt("disposition", "disposition_status");

    const stages: JourneyStage[] = [
      { key: "arrival", label: "Arrived", icon: Clock3, timestamp: view.encounter.arrivedAt },
      { key: "triage", label: "Triage", icon: ShieldAlert, timestamp: chronologicalTriage[0]?.performedAt ?? null, count: triages.length },
      { key: "vitals", label: "Vitals", icon: Activity, timestamp: firstAt("vitals"), count: eventsOf("vitals").length },
      { key: "assessment", label: "Assessment", icon: Stethoscope, timestamp: firstAt("assessment"), count: eventsOf("assessment").length },
      { key: "orders", label: "Orders", icon: ClipboardList, timestamp: firstAt("order"), count: eventsOf("order").length },
      { key: "results", label: "Results", icon: FlaskConical, timestamp: firstAt("result"), count: eventsOf("result").length },
      { key: "treatment", label: "Treatment", icon: HeartPulse, timestamp: firstAt("treatment", "medication"), count: eventsOf("treatment", "medication").length },
      { key: "reassessment", label: "Reassess", icon: RefreshCw, timestamp: firstAt("reassessment"), count: eventsOf("reassessment").length },
      { key: "disposition", label: "Disposition", icon: Signpost, timestamp: dispositionAt, count: eventsOf("disposition", "disposition_status").length },
    ];
    if (["admitted", "icu", "ward", "operating_room"].includes(view.encounter.disposition ?? "")) {
      stages.push(
        { key: "boarding", label: "Boarding", icon: MapPin, timestamp: firstStatusAt("BOARDING") },
        { key: "handoff", label: "Handoff", icon: ClipboardList, timestamp: firstStatusAt("HANDOFF_PENDING") },
        { key: "departure", label: "Departure", icon: Check, timestamp: firstStatusAt("DEPARTED_ADMITTED") ?? view.encounter.closedAt },
      );
    } else if (view.encounter.disposition === "transferred") {
      stages.push(
        { key: "handoff", label: "Handoff", icon: ClipboardList, timestamp: firstStatusAt("HANDOFF_PENDING") },
        { key: "departure", label: "Departure", icon: Check, timestamp: firstStatusAt("DEPARTED_TRANSFERRED") ?? view.encounter.closedAt },
      );
    } else if (view.encounter.disposition === "discharged") {
      stages.push({ key: "departure", label: "Departure", icon: Check, timestamp: firstStatusAt("DEPARTED_DISCHARGED") ?? view.encounter.closedAt });
    }

    const items: JourneyItem[] = [
      {
        id: `arrival-${encounterId}`,
        type: "arrival",
        label: "Arrived in the emergency department",
        detail: `${view.encounter.arrivalMethod?.replace(/_/g, " ") ?? "Arrival method not recorded"}${view.encounter.referralSource ? ` from ${view.encounter.referralSource}` : ""}`,
        actor: null,
        timestamp: view.encounter.arrivedAt,
        icon: Clock3,
        tone: "primary" as const,
      },
      ...chronologicalTriage.map((triage, index) => ({
        id: triage.id,
        type: index === 0 ? "triage" : "re_triage",
        label: index === 0 ? `${triage.algorithm.toUpperCase()} triage: ${String(triage.level).toUpperCase()}` : `Re-triaged to ${String(triage.level).toUpperCase()}`,
        detail: triage.note ?? "Priority assessment recorded",
        actor: null,
        timestamp: triage.performedAt,
        icon: ShieldAlert,
        tone: triage.level === 1 || triage.level === "red" ? "red" as const : "yellow" as const,
      })),
      ...chronologicalEvents
        .filter((event) => event.type !== "created" && event.type !== "re_triage")
        .map(eventToJourneyItem),
    ].sort((a, b) => a.timestamp - b.timestamp);

    return { stages, items };
  }, [encounterId, events, triages, view]);

  if (!view) return null;

  const currentStageIndex = journey.stages.reduce(
    (latest, stage, index) => stage.timestamp !== null ? index : latest,
    0,
  );
  const orderCount = events.filter((event) => event.type === "order").length;

  return (
    <div className="space-y-3">
      <section className="card overflow-hidden">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--color-primary)]">Clinical journey</p>
            <h2 className="text-lg font-semibold">{view.patient.name ?? "Unknown patient"}</h2>
            <p className="text-sm text-[var(--color-ink-secondary)]">
              {view.patient.mrn ?? view.patient.displayNumber} | {view.encounter.caseNumber ?? view.encounter.id.slice(0, 8)}
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 max-[720px]:grid-cols-2">
            <JourneyMetric label="Time in ER" value={formatDuration(Date.now() - view.encounter.arrivedAt)} />
            <JourneyMetric label="Events" value={String(journey.items.length)} />
            <JourneyMetric label="Orders" value={String(orderCount)} />
            <JourneyMetric label="State" value={workflowStatusForEncounter(view.encounter).replace(/_/g, " ").toLowerCase()} />
          </div>
        </div>

        <div className="grid grid-cols-9 gap-y-4 px-1 max-[980px]:grid-cols-5 max-[560px]:grid-cols-3">
          {journey.stages.map((stage, index) => {
            const completed = stage.timestamp !== null;
            const active = index === currentStageIndex;
            const Icon = stage.icon;
            return (
              <div key={stage.key} className="relative flex min-w-0 flex-col items-center text-center">
                {index > 0 && (
                  <div
                    className="absolute right-1/2 top-5 h-0.5 w-full max-[980px]:hidden"
                    style={{ background: completed ? "var(--color-green-solid)" : "var(--color-border-strong)" }}
                  />
                )}
                <div
                  className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2"
                  style={{
                    background: completed ? "var(--color-green-tint)" : active ? "var(--color-primary-tint)" : "var(--color-surface)",
                    borderColor: completed ? "var(--color-green-solid)" : active ? "var(--color-primary)" : "var(--color-border-strong)",
                    color: completed ? "var(--color-green-solid)" : active ? "var(--color-primary)" : "var(--color-ink-secondary)",
                  }}
                >
                  {completed ? <Check size={18} /> : <Icon size={17} />}
                </div>
                <div className="mt-2 text-sm font-semibold">{stage.label}</div>
                <div className="mt-0.5 min-h-4 text-xs text-[var(--color-ink-secondary)]">
                  {stage.timestamp ? formatTime(stage.timestamp) : active ? "Next" : "Pending"}
                </div>
                {Boolean(stage.count && stage.count > 1) && (
                  <span className="mt-1 rounded-full bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs font-semibold">{stage.count}</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Encounter timeline</h2>
            <p className="text-xs text-[var(--color-ink-secondary)]">Every clinical action in timestamp order.</p>
          </div>
          <span className="rounded-md bg-[var(--color-surface-muted)] px-2.5 py-1 text-sm font-semibold">{journey.items.length} events</span>
        </div>

        <div className="relative space-y-0 before:absolute before:bottom-4 before:left-[19px] before:top-4 before:w-px before:bg-[var(--color-border-strong)]">
          {journey.items.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.id} className="relative grid grid-cols-[40px_92px_minmax(0,1fr)_minmax(96px,auto)] items-start gap-3 border-b border-[var(--color-border)] py-3 last:border-0 max-[720px]:grid-cols-[40px_minmax(0,1fr)]">
                <div
                  className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border"
                  style={{ background: toneBackground(item.tone), borderColor: toneColor(item.tone), color: toneColor(item.tone) }}
                >
                  <Icon size={17} />
                </div>
                <time className="pt-1 text-sm font-semibold text-[var(--color-ink-secondary)] max-[720px]:hidden">{formatTime(item.timestamp)}</time>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm">{item.label}</strong>
                    <span className="rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs font-semibold capitalize text-[var(--color-ink-secondary)]">{item.type.replace(/_/g, " ")}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-[var(--color-ink-secondary)]">{item.detail}</p>
                  <div className="mt-1 hidden text-xs text-[var(--color-ink-secondary)] max-[720px]:block">{formatDateTime(item.timestamp)}</div>
                </div>
                <div className="pt-1 text-right text-xs font-medium text-[var(--color-ink-secondary)] max-[720px]:col-start-2 max-[720px]:text-left">
                  {item.actor ?? formatDate(item.timestamp)}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function eventToJourneyItem(event: ClinicalEvent): JourneyItem {
  const content = (event.content ?? {}) as Record<string, unknown>;
  const actor = typeof content.actor === "string" ? content.actor : null;
  const base = { id: event.id, type: event.type, timestamp: event.recordedAt, actor };

  switch (event.type) {
    case "vitals":
      return { ...base, label: "Vital signs recorded", detail: [content.bp && `BP ${content.bp}`, content.hr && `HR ${content.hr}`, content.spo2 && `SpO2 ${content.spo2}%`, content.temp && `Temp ${content.temp}°`].filter(Boolean).join(" | ") || "Vitals recorded", icon: Activity, tone: "primary" };
    case "assessment":
      return { ...base, label: String(content.impression || "Doctor assessment"), detail: content.plan ? `Plan: ${String(content.plan)}` : "Clinical assessment documented", icon: Stethoscope, tone: "primary" };
    case "order":
      return { ...base, label: String(content.name || "Medical order"), detail: `${String(content.orderType || "Order").replace(/_/g, " ")} | ${String(content.priority || "routine")} priority${content.details ? ` | ${String(content.details)}` : ""}`, icon: ClipboardList, tone: content.priority === "stat" ? "red" : "yellow" };
    case "order_status":
      return { ...base, label: `Order ${String(content.status || "updated").replace(/_/g, " ")}`, detail: String(content.reason || "Order workflow updated"), icon: TestTube2, tone: content.status === "completed" ? "green" : "yellow" };
    case "result":
      return { ...base, label: content.critical ? "Critical result" : "Result available", detail: String(content.result || "Result documented"), icon: FlaskConical, tone: content.critical ? "red" : "green" };
    case "critical_alert":
      return { ...base, label: `Critical alert ${String(content.status || "created")}`, detail: String(content.actionTaken || "Clinician acknowledgement required"), icon: AlertTriangle, tone: content.status === "acknowledged" ? "green" : "red" };
    case "treatment":
    case "medication":
      return { ...base, label: String(content.name || content.medication || "Treatment given"), detail: String(content.details || content.notAdministeredReason || content.response || "Administration documented"), icon: HeartPulse, tone: content.notAdministeredReason ? "yellow" : "green" };
    case "reassessment":
      return { ...base, label: `Reassessment: ${String(content.response || "recorded")}`, detail: `${String(content.notes || "Clinical response reviewed")}${content.painScore !== null && content.painScore !== undefined ? ` | Pain ${String(content.painScore)}/10` : ""}`, icon: RefreshCw, tone: content.response === "worse" ? "red" : content.response === "improved" ? "green" : "yellow" };
    case "location":
      return { ...base, label: `Moved to ${String(content.locationName || "new location")}`, detail: String(content.zone || "Location assignment recorded"), icon: MapPin, tone: "neutral" };
    case "disposition":
    case "disposition_status":
      return { ...base, label: `Disposition: ${String(content.disposition || content.status || "updated").replace(/_/g, " ")}`, detail: String(content.details || "Disposition workflow updated"), icon: Signpost, tone: "primary" };
    case "note":
      return { ...base, label: "Clinical note", detail: String(content.text || "Note documented"), icon: FileText, tone: "neutral" };
    default:
      return { ...base, label: event.type.replace(/_/g, " "), detail: summarizeContent(content), icon: FileText, tone: "neutral" };
  }
}

function JourneyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[var(--color-surface-muted)] px-2.5 py-1.5">
      <div className="text-xs font-semibold uppercase text-[var(--color-ink-secondary)]">{label}</div>
      <div className="text-sm font-semibold capitalize leading-snug">{value}</div>
    </div>
  );
}

function summarizeContent(content: Record<string, unknown>) {
  const value = content.text ?? content.name ?? content.provider ?? content.locationName;
  return value ? String(value) : "Event documented";
}

function toneColor(tone: JourneyItem["tone"]) {
  if (tone === "green") return "var(--color-green-solid)";
  if (tone === "yellow") return "var(--color-yellow-solid)";
  if (tone === "red") return "var(--color-red-solid)";
  if (tone === "primary") return "var(--color-primary)";
  return "var(--color-ink-secondary)";
}

function toneBackground(tone: JourneyItem["tone"]) {
  if (tone === "green") return "var(--color-green-tint)";
  if (tone === "yellow") return "var(--color-yellow-tint)";
  if (tone === "red") return "var(--color-red-tint)";
  if (tone === "primary") return "var(--color-primary-tint)";
  return "var(--color-surface-muted)";
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDuration(milliseconds: number) {
  const minutes = Math.max(0, Math.floor(milliseconds / 60000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
