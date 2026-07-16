import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Plus, Search } from "lucide-react";
import { ClinicalWorklist } from "../../components/ClinicalWorklist";
import { ClinicalAuditHistory } from "../../components/ClinicalAuditHistory";
import { StatusPill } from "../../components/DomainTab";
import { TriageBadge } from "../../components/TriageBadge";
import { acknowledgeCriticalResultRecord, reviewResultRecord } from "../../db/repo";
import {
  criticalResultRequiresAcknowledgement,
  resultRequiresAttention,
  resultReviewStatus,
  resultStatus,
} from "../../lib/clinicalWorkflow";
import { useNow } from "../../lib/useNow";
import { useAppStore } from "../../store/useAppStore";
import type {
  AuditEvent,
  Encounter,
  OrderRecord,
  Patient,
  ResultRecord,
  ResultReviewStatus,
  ResultStatus,
  TriageLevel,
} from "../../types";
import { useClinicalWorkspaceSnapshot } from "./clinical/useClinicalWorkspaceSnapshot";

const RESULT_STATUSES: ResultStatus[] = ["pending", "preliminary", "final", "corrected", "cancelled"];
const REVIEW_STATUSES: ResultReviewStatus[] = ["unreviewed", "reviewed", "acknowledged", "action_required"];

export function ResultsWorkspace() {
  const { patientId: routePatientId } = useParams<{ patientId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = useAppStore((state) => state.mode);
  const pushToast = useAppStore((state) => state.pushToast);
  const now = useNow();
  const snapshot = useClinicalWorkspaceSnapshot();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [criticalAction, setCriticalAction] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const patientById = useMemo(
    () => new Map(snapshot.data.patients.map((patient) => [patient.id, patient])),
    [snapshot.data.patients],
  );
  const encounterById = useMemo(
    () => new Map(snapshot.data.encounters.map((encounter) => [encounter.id, encounter])),
    [snapshot.data.encounters],
  );
  const orderById = useMemo(
    () => new Map(snapshot.data.orders.map((order) => [order.id, order])),
    [snapshot.data.orders],
  );
  const triageByEncounter = useMemo(
    () => latestTriageMap(snapshot.data.triageAssessments),
    [snapshot.data.triageAssessments],
  );
  const departmentOptions = useMemo(
    () => unique(snapshot.data.orders.map((order) => departmentFor(order))),
    [snapshot.data.orders],
  );
  const locationOptions = useMemo(
    () => unique(
      snapshot.data.encounters
        .map((encounter) => encounter.currentLocationName)
        .filter((value): value is string => Boolean(value)),
    ),
    [snapshot.data.encounters],
  );

  const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const view = searchParams.get("view") ?? "unreviewed";
  const severity = searchParams.get("severity") ?? "all";
  const review = searchParams.get("review") ?? searchParams.get("reviewStatus") ?? "all";
  const status = searchParams.get("status") ?? "all";
  const department = searchParams.get("department") ?? "all";
  const location = searchParams.get("location") ?? "all";
  const timeRange = searchParams.get("time") ?? "all";
  const orderId = searchParams.get("orderId");
  const rows = useMemo(
    () => snapshot.data.results
      .filter((result) => {
        if (routePatientId && result.patientId !== routePatientId) return false;
        if (orderId && result.orderId !== orderId) return false;
        const patient = patientById.get(result.patientId);
        const encounter = encounterById.get(result.encounterId);
        const order = result.orderId ? orderById.get(result.orderId) : undefined;
        const searchable = `${patient?.name ?? ""} ${patient?.mrn ?? patient?.displayNumber ?? ""} ${encounter?.caseNumber ?? ""} ${result.name} ${result.value ?? ""} ${order?.name ?? ""}`.toLowerCase();

        if (query && !searchable.includes(query)) return false;
        if (severity !== "all" && result.flag !== severity) return false;
        if (review === "requires_attention" && !resultRequiresAttention(result)) return false;
        if (review !== "all" && review !== "requires_attention" && resultReviewStatus(result) !== review) return false;
        if (status !== "all" && resultStatus(result) !== status) return false;
        if (department !== "all" && departmentFor(order) !== department) return false;
        if (location !== "all" && encounter?.currentLocationName !== location) return false;
        if (timeRange !== "all" && result.resultedAt < timeRangeStart(timeRange, now)) return false;
        if (view === "unreviewed" && !resultRequiresAttention(result)) return false;
        if (view === "critical" && result.flag !== "critical") return false;
        if (view === "reviewed" && !["reviewed", "acknowledged"].includes(resultReviewStatus(result))) return false;
        if (view === "laboratory" && order?.orderType !== "laboratory") return false;
        if (view === "imaging" && order?.orderType !== "imaging") return false;
        if (view === "procedures" && order?.orderType !== "procedure") return false;
        return true;
      })
      .sort((a, b) => {
        const criticalDelta = Number(b.flag === "critical") - Number(a.flag === "critical");
        const reviewDelta = resultAttentionRank(b) - resultAttentionRank(a);
        return criticalDelta || reviewDelta || b.resultedAt - a.resultedAt;
      }),
    [department, encounterById, location, now, orderById, orderId, patientById, query, review, routePatientId, severity, snapshot.data.results, status, timeRange, view],
  );

  const selectedResult = selectedId
    ? snapshot.data.results.find((result) => result.id === selectedId) ?? null
    : null;

  function setFilter(key: string, value: string, replace = false) {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "all" || (key === "view" && value === "unreviewed")) next.delete(key);
    else next.set(key, value);
    if (key === "review") {
      next.delete("reviewStatus");
      if (!searchParams.has("view") && ["reviewed", "acknowledged"].includes(value)) next.set("view", "all");
    }
    setSearchParams(next, { replace });
  }

  function openResult(id: string) {
    setCriticalAction("");
    setSelectedId(id);
  }

  async function markReviewed(result: ResultRecord) {
    setBusyId(result.id);
    try {
      await reviewResultRecord(result.id, "Demo Provider", mode);
      pushToast("Result marked reviewed");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Result could not be reviewed");
    } finally {
      setBusyId(null);
    }
  }

  async function acknowledgeCritical(result: ResultRecord) {
    setBusyId(result.id);
    try {
      await acknowledgeCriticalResultRecord(result.id, "Demo Provider", criticalAction, mode);
      setCriticalAction("");
      pushToast("Critical result acknowledged");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Critical result could not be acknowledged");
    } finally {
      setBusyId(null);
    }
  }

  const filters = (
    <>
      <label className="clinical-filter-search">
        <span className="sr-only">Search results</span>
        <Search size={15} />
        <input
          value={searchParams.get("q") ?? ""}
          onChange={(event) => setFilter("q", event.target.value, true)}
          placeholder="Patient, MRN, test, or value"
        />
      </label>
      <FilterSelect label="View" value={view} options={["unreviewed", "critical", "reviewed", "laboratory", "imaging", "procedures", "all"]} onChange={(value) => setFilter("view", value)} />
      <FilterSelect label="Severity" value={severity} options={["all", "critical", "abnormal", "normal"]} onChange={(value) => setFilter("severity", value)} />
      <FilterSelect label="Review" value={review} options={["all", "requires_attention", ...REVIEW_STATUSES]} onChange={(value) => setFilter("review", value)} />
      <FilterSelect label="Result status" value={status} options={["all", ...RESULT_STATUSES]} onChange={(value) => setFilter("status", value)} />
      <FilterSelect label="Department" value={department} options={["all", ...departmentOptions]} onChange={(value) => setFilter("department", value)} />
      <FilterSelect label="Location" value={location} options={["all", ...locationOptions]} onChange={(value) => setFilter("location", value)} />
      <FilterSelect label="Time" value={timeRange} options={["all", "4h", "12h", "24h", "today"]} onChange={(value) => setFilter("time", value)} />
      {searchParams.size > 0 && (
        <button type="button" onClick={() => setSearchParams({})} className="clinical-filter-clear">
          Clear filters
        </button>
      )}
    </>
  );

  const drawer = selectedResult ? (
    <ResultDetails
      result={selectedResult}
      patient={patientById.get(selectedResult.patientId)}
      encounter={encounterById.get(selectedResult.encounterId)}
      order={selectedResult.orderId ? orderById.get(selectedResult.orderId) : undefined}
      history={snapshot.data.auditEvents.filter((event) => event.entityType === "result_record" && event.entityId === selectedResult.id)}
      triage={triageByEncounter.get(selectedResult.encounterId) ?? null}
      criticalAction={criticalAction}
      busy={busyId === selectedResult.id}
      onCriticalAction={setCriticalAction}
      onReview={() => void markReviewed(selectedResult)}
      onAcknowledge={() => void acknowledgeCritical(selectedResult)}
      onOpenChart={() => navigate(`/patients/${selectedResult.encounterId}?tab=Results`)}
      onCreateFollowUp={() => navigate(`/patients/${selectedResult.patientId}/orders?create=1&encounterId=${selectedResult.encounterId}`)}
    />
  ) : undefined;

  return (
    <ClinicalWorklist
      title={routePatientId ? "Patient results" : "Results"}
      description="Laboratory, imaging, and procedure results"
      count={rows.length}
      updatedAt={snapshot.updatedAt}
      filters={filters}
      filtersActive={searchParams.size > 0}
      loading={snapshot.loading}
      error={snapshot.error}
      onRetry={snapshot.retry}
      emptyMessage="No results match the current filters."
      hasRows={rows.length > 0}
      drawer={drawer}
      onCloseDrawer={() => setSelectedId(null)}
    >
      <div className="clinical-table-scroll">
        <table className="clinical-table min-w-[1060px]">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Patient</th>
              <th>Test / study</th>
              <th>Result</th>
              <th>Reference</th>
              <th>Resulted</th>
              <th>Department</th>
              <th>Review</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((result) => {
              const patient = patientById.get(result.patientId);
              const encounter = encounterById.get(result.encounterId);
              const order = result.orderId ? orderById.get(result.orderId) : undefined;
              const reviewState = resultReviewStatus(result);
              const needsAttention = resultRequiresAttention(result);
              const acknowledgementDue = criticalResultRequiresAcknowledgement(result);
              return (
                <tr key={result.id} className={acknowledgementDue ? "clinical-row-critical" : undefined}>
                  <td>
                    {result.flag === "critical" ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-red-solid)]">
                        <AlertTriangle size={15} /> Critical
                      </span>
                    ) : (
                      <StatusPill label={result.flag} tone={result.flag === "abnormal" ? "yellow" : "neutral"} />
                    )}
                  </td>
                  <td>
                    <button type="button" onClick={() => openResult(result.id)} className="clinical-patient-link">
                      <strong>{patient?.name ?? patient?.displayNumber ?? "Unknown patient"}</strong>
                      <span>{patient?.mrn ?? "No MRN"} | {encounter?.caseNumber ?? "No case"}</span>
                    </button>
                  </td>
                  <td><strong>{result.name}</strong><span className="clinical-cell-meta">{order?.name ?? "Unlinked result"}</span></td>
                  <td><strong className="tabular-nums">{result.value ?? "Pending"}{result.unit ? ` ${result.unit}` : ""}</strong><span className="clinical-cell-meta capitalize">{resultStatus(result)}</span></td>
                  <td>{result.referenceRange ?? "Not configured"}</td>
                  <td>{formatDateTime(result.resultedAt)}</td>
                  <td>{departmentFor(order)}</td>
                  <td><StatusPill label={acknowledgementDue ? "acknowledgement_due" : reviewState} tone={acknowledgementDue ? "red" : reviewTone(reviewState)} />{result.reviewedBy && <span className="clinical-cell-meta">{result.reviewedBy}</span>}</td>
                  <td className="text-right">
                    <button type="button" onClick={() => openResult(result.id)} className={needsAttention ? "clinical-row-primary" : "clinical-row-secondary"}>
                      {acknowledgementDue ? "Acknowledge" : needsAttention ? "Review" : "Open"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="clinical-mobile-list">
        {rows.map((result) => {
          const patient = patientById.get(result.patientId);
          const encounter = encounterById.get(result.encounterId);
          const reviewState = resultReviewStatus(result);
          const acknowledgementDue = criticalResultRequiresAcknowledgement(result);
          return (
            <article key={result.id} className={`clinical-mobile-row ${acknowledgementDue ? "clinical-row-critical" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                {result.flag === "critical" ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-red-solid)]"><AlertTriangle size={15} /> Critical</span>
                ) : (
                  <StatusPill label={result.flag} tone={result.flag === "abnormal" ? "yellow" : "neutral"} />
                )}
                <span className="text-xs text-[var(--color-ink-secondary)]">{formatDateTime(result.resultedAt)}</span>
              </div>
              <strong className="mt-2 block">{patient?.name ?? patient?.displayNumber ?? "Unknown patient"}</strong>
              <span className="text-xs text-[var(--color-ink-secondary)]">{patient?.mrn ?? "No MRN"} | {encounter?.caseNumber ?? "No case"}</span>
              <div className="mt-2 font-semibold">{result.name}</div>
              <div className="text-sm tabular-nums">{result.value ?? "Pending"}{result.unit ? ` ${result.unit}` : ""}</div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <StatusPill label={acknowledgementDue ? "acknowledgement_due" : reviewState} tone={acknowledgementDue ? "red" : reviewTone(reviewState)} />
                <button type="button" onClick={() => openResult(result.id)} className="clinical-row-primary">
                  {acknowledgementDue ? "Acknowledge" : resultRequiresAttention(result) ? "Review" : "Open"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </ClinicalWorklist>
  );
}

function ResultDetails({
  result,
  patient,
  encounter,
  order,
  history,
  triage,
  criticalAction,
  busy,
  onCriticalAction,
  onReview,
  onAcknowledge,
  onOpenChart,
  onCreateFollowUp,
}: {
  result: ResultRecord;
  patient?: Patient;
  encounter?: Encounter;
  order?: OrderRecord;
  history: AuditEvent[];
  triage: TriageLevel | null;
  criticalAction: string;
  busy: boolean;
  onCriticalAction: (value: string) => void;
  onReview: () => void;
  onAcknowledge: () => void;
  onOpenChart: () => void;
  onCreateFollowUp: () => void;
}) {
  const review = resultReviewStatus(result);
  const needsCriticalAcknowledgement = criticalResultRequiresAcknowledgement(result);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{patient?.name ?? patient?.displayNumber ?? "Unknown patient"}</h2>
        <p className="text-xs text-[var(--color-ink-secondary)]">{patient?.mrn ?? "No MRN"} | {encounter?.caseNumber ?? "No case"}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TriageBadge level={triage} size="sm" />
          <span className="text-sm">{encounter?.currentLocationName ?? "Location unassigned"}</span>
          {encounter?.allergies.length ? <span className="text-sm font-semibold text-[var(--color-red-solid)]">Allergy: {encounter.allergies.join(", ")}</span> : null}
        </div>
      </div>

      {result.flag === "critical" && (
        <div className="rounded-md border border-[var(--color-red-solid)] bg-[var(--color-red-tint)] p-3 text-sm text-[var(--color-red-text)]">
          <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={16} /> Critical result</div>
          <p className="mt-1">Review the value and record the clinical action before acknowledgement.</p>
        </div>
      )}

      <div className="clinical-detail-section">
        <h3>Result</h3>
        <DetailRow label="Test / study" value={result.name} />
        <DetailRow label="Value" value={`${result.value ?? "Pending"}${result.unit ? ` ${result.unit}` : ""}`} />
        <DetailRow label="Reference" value={result.referenceRange ?? "Not configured"} />
        <DetailRow label="Flag" value={result.flag} />
        <DetailRow label="Result status" value={resultStatus(result)} />
        <DetailRow label="Review status" value={review.replace(/_/g, " ")} />
        <DetailRow label="Acknowledgement" value={result.flag !== "critical" ? "Not required" : needsCriticalAcknowledgement ? "Required" : "Acknowledged"} />
        <DetailRow label="Related order" value={order?.name ?? "Not linked"} />
        <DetailRow label="Verified by" value={result.verifiedBy ?? "Not recorded"} />
        <DetailRow label="Resulted" value={formatDateTime(result.resultedAt)} />
        {result.reviewedBy && <DetailRow label="Reviewed by" value={`${result.reviewedBy} | ${result.reviewedAt ? formatDateTime(result.reviewedAt) : "time unavailable"}`} />}
        {result.acknowledgedBy && <DetailRow label="Acknowledged by" value={`${result.acknowledgedBy} | ${result.acknowledgedAt ? formatDateTime(result.acknowledgedAt) : "time unavailable"}`} />}
        {result.criticalActionTaken && <DetailRow label="Action taken" value={result.criticalActionTaken} />}
      </div>

      <ClinicalAuditHistory events={history} title="Result history" />

      {needsCriticalAcknowledgement && (
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-secondary)]">Clinical action taken *</span>
          <textarea
            rows={3}
            value={criticalAction}
            onChange={(event) => onCriticalAction(event.target.value)}
            className="clinical-drawer-textarea"
            placeholder="Provider notified, treatment initiated, follow-up order placed..."
          />
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        {needsCriticalAcknowledgement ? (
          <button type="button" disabled={busy || !criticalAction.trim()} onClick={onAcknowledge} className="clinical-drawer-danger">
            <AlertTriangle size={15} /> {busy ? "Acknowledging..." : "Acknowledge critical result"}
          </button>
        ) : review === "unreviewed" || review === "action_required" ? (
          <button type="button" disabled={busy} onClick={onReview} className="clinical-drawer-primary">
            <CheckCircle2 size={15} /> {busy ? "Saving..." : "Mark reviewed"}
          </button>
        ) : null}
        <button type="button" onClick={onCreateFollowUp} className="clinical-row-secondary"><Plus size={15} /> Follow-up order</button>
        <button type="button" onClick={onOpenChart} className="clinical-row-secondary">Open patient chart</button>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="clinical-filter-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option.replace(/_/g, " ")}</option>)}
      </select>
    </label>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="clinical-detail-row"><dt>{label}</dt><dd>{value}</dd></div>;
}

function reviewTone(status: ResultReviewStatus): "primary" | "green" | "yellow" | "red" | "neutral" {
  if (status === "acknowledged" || status === "reviewed") return "green";
  if (status === "action_required") return "red";
  return "yellow";
}

function resultAttentionRank(result: ResultRecord) {
  if (criticalResultRequiresAcknowledgement(result)) return 3;
  const status = resultReviewStatus(result);
  return status === "action_required" ? 2 : status === "unreviewed" ? 1 : 0;
}

function departmentFor(order?: OrderRecord) {
  if (!order) return "Not recorded";
  if (order.requestedDepartment) return order.requestedDepartment;
  if (order.orderType === "laboratory") return "Laboratory";
  if (order.orderType === "imaging") return "Radiology";
  return "Emergency Department";
}

function latestTriageMap(rows: Array<{ encounterId: string; level: TriageLevel; performedAt: number }>) {
  const map = new Map<string, TriageLevel>();
  for (const row of [...rows].sort((a, b) => a.performedAt - b.performedAt)) map.set(row.encounterId, row.level);
  return map;
}

function unique(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function timeRangeStart(range: string, now: number) {
  if (range === "4h") return now - 4 * 60 * 60 * 1000;
  if (range === "12h") return now - 12 * 60 * 60 * 1000;
  if (range === "24h") return now - 24 * 60 * 60 * 1000;
  if (range === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  }
  return 0;
}

function formatDateTime(value: number) {
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
