import {
  Pill,
  Stethoscope,
  FlaskConical,
  TestTube2,
  Syringe,
  Scissors,
  ClipboardList,
  Receipt,
  Paperclip,
} from "lucide-react";
import { DomainTab, StatusPill, type Tone } from "../../../components/DomainTab";
import {
  useMedications,
  useConditions,
  useOrderRecords,
  useResultRecords,
  useImmunizations,
  useProcedures,
  usePrograms,
  useBillingItems,
  useAttachments,
} from "../../../db/hooks";
import {
  addMedication,
  updateMedication,
  removeMedication,
  addCondition,
  updateCondition,
  removeCondition,
  addOrderRecord,
  updateOrderRecord,
  removeOrderRecord,
  addResultRecord,
  updateResultRecord,
  removeResultRecord,
  addImmunization,
  updateImmunization,
  removeImmunization,
  addProcedure,
  updateProcedure,
  removeProcedure,
  addProgram,
  updateProgram,
  removeProgram,
  addBillingItem,
  updateBillingItem,
  removeBillingItem,
  addAttachment,
  updateAttachment,
  removeAttachment,
} from "../../../db/repo";
import { useAppStore } from "../../../store/useAppStore";
import {
  MEDICATION_OPTIONS,
  ROUTE_OPTIONS,
  FREQUENCY_OPTIONS,
  CONDITION_OPTIONS,
  CONDITION_CATEGORY_OPTIONS,
  orderOptionsFor,
  RESULT_NAME_OPTIONS,
  resultMetaFor,
  IMMUNIZATION_OPTIONS,
  PROCEDURE_OPTIONS,
  PROCEDURE_CATEGORY_OPTIONS,
  PROGRAM_OPTIONS,
  BILLING_DESCRIPTION_OPTIONS,
  billingMetaFor,
  ATTACHMENT_TITLE_OPTIONS,
} from "../../../lib/clinicalCatalog";
import type { Mode } from "../../../types";

function fmtDate(value: number | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}
function fmtDateTime(value: number | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function toMillis(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  return Number.isNaN(t) ? null : t;
}
function toDateInput(value: number | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

const STATUS_TONE: Record<string, Tone> = {
  active: "green",
  chronic: "yellow",
  past: "neutral",
  stopped: "neutral",
  resolved: "neutral",
  inactive: "neutral",
  completed: "green",
  ordered: "primary",
  in_progress: "yellow",
  result_available: "primary",
  cancelled: "neutral",
  rejected: "red",
  failed: "red",
  normal: "green",
  abnormal: "yellow",
  critical: "red",
  administered: "green",
  due: "yellow",
  declined: "neutral",
  enrolled: "primary",
  discharged: "neutral",
  pending: "yellow",
  billed: "primary",
  paid: "green",
  waived: "neutral",
};
const tone = (status: string): Tone => STATUS_TONE[status] ?? "neutral";

// ---------------------------------------------------------------------------

export function MedicationsTab({ patientId, encounterId }: { patientId: string; encounterId: string }) {
  const mode = useAppStore((s) => s.mode) as Mode;
  const rows = useMedications(patientId);
  return (
    <DomainTab
      title="Medications"
      subtitle="Home and in-visit medications, current and past."
      icon={Pill}
      rows={rows}
      addLabel="Add medication"
      columns={[
        { header: "Medication", primary: true, render: (r) => r.name },
        { header: "Dose", render: (r) => r.dose || "—" },
        { header: "Route", render: (r) => r.route || "—" },
        { header: "Frequency", render: (r) => r.frequency || "—" },
        { header: "Prescriber", render: (r) => r.prescriber || "—" },
        { header: "Status", render: (r) => <StatusPill label={r.status} tone={tone(r.status)} /> },
      ]}
      fields={[
        { key: "name", label: "Medication", required: true, span: 2, suggestions: MEDICATION_OPTIONS, placeholder: "Amlodipine 5 mg" },
        { key: "dose", label: "Dose", placeholder: "5 mg" },
        { key: "route", label: "Route", type: "select", options: ["", ...ROUTE_OPTIONS] },
        { key: "frequency", label: "Frequency", type: "select", options: ["", ...FREQUENCY_OPTIONS] },
        { key: "prescriber", label: "Prescriber", placeholder: "Dr. …" },
        { key: "status", label: "Status", type: "select", options: ["active", "past", "stopped"] },
        { key: "notes", label: "Notes", type: "textarea", span: 2 },
      ]}
      emptyDraft={{ name: "", dose: "", route: "", frequency: "", prescriber: "", status: "active", notes: "" }}
      toDraft={(r) => ({ name: r.name, dose: r.dose ?? "", route: r.route ?? "", frequency: r.frequency ?? "", prescriber: r.prescriber ?? "", status: r.status, notes: r.notes ?? "" })}
      onAdd={(d) => addMedication({ patientId, encounterId, name: d.name, dose: d.dose || null, route: d.route || null, frequency: d.frequency || null, status: d.status as "active" | "past" | "stopped", startedAt: Date.now(), stoppedAt: null, prescriber: d.prescriber || null, notes: d.notes || null }, mode)}
      onUpdate={(id, d) => updateMedication(id, { name: d.name, dose: d.dose || null, route: d.route || null, frequency: d.frequency || null, status: d.status as "active" | "past" | "stopped", prescriber: d.prescriber || null, notes: d.notes || null }, mode)}
      onRemove={(id) => removeMedication(id, mode)}
    />
  );
}

export function ConditionsTab({ patientId, encounterId }: { patientId: string; encounterId: string }) {
  const mode = useAppStore((s) => s.mode) as Mode;
  const rows = useConditions(patientId);
  return (
    <DomainTab
      title="Conditions"
      subtitle="Diagnoses and ongoing medical problems."
      icon={Stethoscope}
      rows={rows}
      addLabel="Add condition"
      columns={[
        { header: "Condition", primary: true, render: (r) => r.name },
        { header: "Category", render: (r) => r.category || "—" },
        { header: "Onset", render: (r) => r.onsetDate || "—" },
        { header: "Status", render: (r) => <StatusPill label={r.status} tone={tone(r.status)} /> },
        { header: "Notes", render: (r) => r.notes || "—" },
      ]}
      fields={[
        { key: "name", label: "Condition", required: true, span: 2, suggestions: CONDITION_OPTIONS },
        { key: "category", label: "Category", type: "select", options: ["", ...CONDITION_CATEGORY_OPTIONS] },
        { key: "onsetDate", label: "Onset date", type: "date" },
        { key: "status", label: "Status", type: "select", options: ["active", "chronic", "resolved"] },
        { key: "notes", label: "Notes", type: "textarea", span: 2 },
      ]}
      emptyDraft={{ name: "", category: "", onsetDate: "", status: "active", notes: "" }}
      toDraft={(r) => ({ name: r.name, category: r.category ?? "", onsetDate: r.onsetDate ?? "", status: r.status, notes: r.notes ?? "" })}
      onAdd={(d) => addCondition({ patientId, encounterId, name: d.name, category: d.category || null, onsetDate: d.onsetDate || null, status: d.status as "active" | "resolved" | "chronic", notes: d.notes || null }, mode)}
      onUpdate={(id, d) => updateCondition(id, { name: d.name, category: d.category || null, onsetDate: d.onsetDate || null, status: d.status as "active" | "resolved" | "chronic", notes: d.notes || null }, mode)}
      onRemove={(id) => removeCondition(id, mode)}
    />
  );
}

const ORDER_TYPE_OPTIONS = ["laboratory", "imaging", "procedure", "consultation", "treatment", "nursing", "blood_product", "observation", "monitoring", "other"];

export function OrdersTab({ patientId, encounterId }: { patientId: string; encounterId: string }) {
  const mode = useAppStore((s) => s.mode) as Mode;
  const rows = useOrderRecords(encounterId);
  return (
    <DomainTab
      title="Orders"
      subtitle="Labs, imaging, medications and procedures ordered this visit."
      icon={FlaskConical}
      rows={rows}
      addLabel="Add order"
      columns={[
        { header: "Order", primary: true, render: (r) => r.name },
        { header: "Type", render: (r) => <StatusPill label={r.orderType} tone="primary" /> },
        { header: "Priority", render: (r) => <StatusPill label={r.priority} tone={r.priority === "stat" ? "red" : r.priority === "urgent" ? "yellow" : "neutral"} /> },
        { header: "Details", render: (r) => r.details || "—" },
        { header: "Ordered", render: (r) => fmtDateTime(r.orderedAt) },
        { header: "Status", render: (r) => <StatusPill label={r.status} tone={tone(r.status)} /> },
      ]}
      minTableWidth={780}
      fields={[
        { key: "orderType", label: "Type", type: "select", options: ORDER_TYPE_OPTIONS, onChange: () => undefined },
        { key: "priority", label: "Priority", type: "select", options: ["routine", "urgent", "stat"] },
        { key: "name", label: "Order", required: true, span: 2, suggestions: orderOptionsFor("laboratory"), placeholder: "CBC, CT head…" },
        { key: "details", label: "Details", span: 2, placeholder: "Dose, site, clinical question" },
        { key: "actor", label: "Ordered by", placeholder: "Dr. …" },
      ]}
      emptyDraft={{ orderType: "laboratory", priority: "routine", name: "", details: "", actor: "" }}
      toDraft={(r) => ({ orderType: r.orderType, priority: r.priority, name: r.name, details: r.details ?? "", actor: r.actor ?? "" })}
      onAdd={(d) => addOrderRecord({ encounterId, patientId, orderType: d.orderType as never, name: d.name, details: d.details || null, priority: d.priority as "routine" | "urgent" | "stat", status: "ordered", actor: d.actor || null }, mode)}
      onUpdate={(id, d) => updateOrderRecord(id, { orderType: d.orderType as never, name: d.name, details: d.details || null, priority: d.priority as "routine" | "urgent" | "stat", actor: d.actor || null }, mode)}
      onRemove={(id) => removeOrderRecord(id, mode)}
    />
  );
}

export function ResultsTab({ patientId, encounterId }: { patientId: string; encounterId: string }) {
  const mode = useAppStore((s) => s.mode) as Mode;
  const rows = useResultRecords(encounterId);
  return (
    <DomainTab
      title="Results"
      subtitle="Verified laboratory and diagnostic results."
      icon={TestTube2}
      rows={rows}
      addLabel="Add result"
      columns={[
        { header: "Test", primary: true, render: (r) => r.name },
        { header: "Value", align: "right", render: (r) => `${r.value ?? "—"}${r.unit ? ` ${r.unit}` : ""}` },
        { header: "Reference", render: (r) => r.referenceRange || "—" },
        { header: "Flag", render: (r) => <StatusPill label={r.flag} tone={tone(r.flag)} /> },
        { header: "Verified by", render: (r) => r.verifiedBy || "—" },
        { header: "Resulted", render: (r) => fmtDateTime(r.resultedAt) },
      ]}
      minTableWidth={780}
      fields={[
        { key: "name", label: "Test", required: true, span: 2, suggestions: RESULT_NAME_OPTIONS, onChange: (value) => {
          const meta = resultMetaFor(value);
          return meta ? ({ unit: meta.unit, referenceRange: meta.referenceRange } as never) : undefined;
        } },
        { key: "value", label: "Value" },
        { key: "unit", label: "Unit" },
        { key: "referenceRange", label: "Reference range" },
        { key: "flag", label: "Flag", type: "select", options: ["normal", "abnormal", "critical"] },
        { key: "verifiedBy", label: "Verified by", placeholder: "Lab tech / Dr. …" },
      ]}
      emptyDraft={{ name: "", value: "", unit: "", referenceRange: "", flag: "normal", verifiedBy: "" }}
      toDraft={(r) => ({ name: r.name, value: r.value ?? "", unit: r.unit ?? "", referenceRange: r.referenceRange ?? "", flag: r.flag, verifiedBy: r.verifiedBy ?? "" })}
      onAdd={(d) => addResultRecord({ encounterId, patientId, orderId: null, name: d.name, value: d.value || null, unit: d.unit || null, referenceRange: d.referenceRange || null, flag: d.flag as "normal" | "abnormal" | "critical", verifiedBy: d.verifiedBy || null }, mode)}
      onUpdate={(id, d) => updateResultRecord(id, { name: d.name, value: d.value || null, unit: d.unit || null, referenceRange: d.referenceRange || null, flag: d.flag as "normal" | "abnormal" | "critical", verifiedBy: d.verifiedBy || null }, mode)}
      onRemove={(id) => removeResultRecord(id, mode)}
    />
  );
}

export function ProceduresTab({ patientId, encounterId }: { patientId: string; encounterId: string }) {
  const mode = useAppStore((s) => s.mode) as Mode;
  const rows = useProcedures(encounterId);
  return (
    <DomainTab
      title="Procedures"
      subtitle="Interventions performed during this encounter."
      icon={Scissors}
      rows={rows}
      addLabel="Add procedure"
      columns={[
        { header: "Procedure", primary: true, render: (r) => r.name },
        { header: "Category", render: (r) => r.category || "—" },
        { header: "Operator", render: (r) => r.operator || "—" },
        { header: "Site", render: (r) => r.site || "—" },
        { header: "Outcome", render: (r) => r.outcome || "—" },
        { header: "Performed", render: (r) => fmtDateTime(r.performedAt) },
      ]}
      minTableWidth={780}
      fields={[
        { key: "name", label: "Procedure", required: true, span: 2, suggestions: PROCEDURE_OPTIONS },
        { key: "category", label: "Category", type: "select", options: ["", ...PROCEDURE_CATEGORY_OPTIONS] },
        { key: "performedAt", label: "Performed date", type: "date" },
        { key: "operator", label: "Operator", placeholder: "Dr. / Nurse …" },
        { key: "site", label: "Site" },
        { key: "outcome", label: "Outcome", span: 2 },
        { key: "notes", label: "Notes", type: "textarea", span: 2 },
      ]}
      emptyDraft={{ name: "", category: "", performedAt: "", operator: "", site: "", outcome: "", notes: "" }}
      toDraft={(r) => ({ name: r.name, category: r.category ?? "", performedAt: toDateInput(r.performedAt), operator: r.operator ?? "", site: r.site ?? "", outcome: r.outcome ?? "", notes: r.notes ?? "" })}
      onAdd={(d) => addProcedure({ encounterId, patientId, name: d.name, category: d.category || null, performedAt: toMillis(d.performedAt) ?? Date.now(), operator: d.operator || null, site: d.site || null, outcome: d.outcome || null, notes: d.notes || null }, mode)}
      onUpdate={(id, d) => updateProcedure(id, { name: d.name, category: d.category || null, performedAt: toMillis(d.performedAt), operator: d.operator || null, site: d.site || null, outcome: d.outcome || null, notes: d.notes || null }, mode)}
      onRemove={(id) => removeProcedure(id, mode)}
    />
  );
}

export function ImmunizationsTab({ patientId, encounterId }: { patientId: string; encounterId: string }) {
  const mode = useAppStore((s) => s.mode) as Mode;
  const rows = useImmunizations(patientId);
  return (
    <DomainTab
      title="Immunizations"
      subtitle="Vaccination history and due doses."
      icon={Syringe}
      rows={rows}
      addLabel="Add immunization"
      columns={[
        { header: "Vaccine", primary: true, render: (r) => r.vaccine },
        { header: "Dose", render: (r) => r.dose || "—" },
        { header: "Date", render: (r) => r.date || "—" },
        { header: "Site", render: (r) => r.site || "—" },
        { header: "Provider", render: (r) => r.provider || "—" },
        { header: "Status", render: (r) => <StatusPill label={r.status} tone={tone(r.status)} /> },
      ]}
      fields={[
        { key: "vaccine", label: "Vaccine", required: true, span: 2, suggestions: IMMUNIZATION_OPTIONS },
        { key: "dose", label: "Dose", placeholder: "Booster / 1st dose" },
        { key: "date", label: "Date", type: "date" },
        { key: "site", label: "Site", placeholder: "Left deltoid" },
        { key: "lot", label: "Lot" },
        { key: "provider", label: "Provider" },
        { key: "status", label: "Status", type: "select", options: ["administered", "due", "declined"] },
      ]}
      emptyDraft={{ vaccine: "", dose: "", date: "", site: "", lot: "", provider: "", status: "administered" }}
      toDraft={(r) => ({ vaccine: r.vaccine, dose: r.dose ?? "", date: r.date ?? "", site: r.site ?? "", lot: r.lot ?? "", provider: r.provider ?? "", status: r.status })}
      onAdd={(d) => addImmunization({ patientId, encounterId, vaccine: d.vaccine, dose: d.dose || null, date: d.date || null, site: d.site || null, lot: d.lot || null, provider: d.provider || null, status: d.status as "administered" | "due" | "declined" }, mode)}
      onUpdate={(id, d) => updateImmunization(id, { vaccine: d.vaccine, dose: d.dose || null, date: d.date || null, site: d.site || null, lot: d.lot || null, provider: d.provider || null, status: d.status as "administered" | "due" | "declined" }, mode)}
      onRemove={(id) => removeImmunization(id, mode)}
    />
  );
}

export function ProgramsTab({ patientId, encounterId }: { patientId: string; encounterId: string }) {
  const mode = useAppStore((s) => s.mode) as Mode;
  const rows = usePrograms(patientId);
  return (
    <DomainTab
      title="Programs"
      subtitle="Care programs and longitudinal follow-up."
      icon={ClipboardList}
      rows={rows}
      addLabel="Add program"
      columns={[
        { header: "Program", primary: true, render: (r) => r.name },
        { header: "Type", render: (r) => <StatusPill label={r.type} tone="primary" /> },
        { header: "Enrolled", render: (r) => fmtDate(r.enrolledAt) },
        { header: "Coordinator", render: (r) => r.coordinator || "—" },
        { header: "Status", render: (r) => <StatusPill label={r.status} tone={tone(r.status)} /> },
      ]}
      fields={[
        { key: "name", label: "Program", required: true, span: 2, suggestions: PROGRAM_OPTIONS },
        { key: "type", label: "Type", type: "select", options: ["chronic-care", "screening", "follow-up", "other"] },
        { key: "enrolledAt", label: "Enrolled date", type: "date" },
        { key: "status", label: "Status", type: "select", options: ["enrolled", "active", "completed", "discharged"] },
        { key: "coordinator", label: "Coordinator", placeholder: "Dr. …" },
        { key: "notes", label: "Notes", type: "textarea", span: 2 },
      ]}
      emptyDraft={{ name: "", type: "chronic-care", enrolledAt: "", status: "enrolled", coordinator: "", notes: "" }}
      toDraft={(r) => ({ name: r.name, type: r.type, enrolledAt: toDateInput(r.enrolledAt), status: r.status, coordinator: r.coordinator ?? "", notes: r.notes ?? "" })}
      onAdd={(d) => addProgram({ patientId, encounterId, name: d.name, type: d.type as never, enrolledAt: toMillis(d.enrolledAt) ?? Date.now(), status: d.status as never, coordinator: d.coordinator || null, notes: d.notes || null }, mode)}
      onUpdate={(id, d) => updateProgram(id, { name: d.name, type: d.type as never, enrolledAt: toMillis(d.enrolledAt), status: d.status as never, coordinator: d.coordinator || null, notes: d.notes || null }, mode)}
      onRemove={(id) => removeProgram(id, mode)}
    />
  );
}

export function BillingTab({ patientId, encounterId }: { patientId: string; encounterId: string }) {
  const mode = useAppStore((s) => s.mode) as Mode;
  const rows = useBillingItems(encounterId);
  const total = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  return (
    <div className="space-y-2">
      <DomainTab
        title="Billing"
        subtitle={`Charges for this encounter · total $${total.toFixed(2)}`}
        icon={Receipt}
        rows={rows}
        addLabel="Add charge"
        columns={[
          { header: "Description", primary: true, render: (r) => r.description },
          { header: "Code", render: (r) => r.code || "—" },
          { header: "Category", render: (r) => r.category || "—" },
          { header: "Amount", align: "right", render: (r) => (r.amount != null ? `$${r.amount.toFixed(2)}` : "—") },
          { header: "Status", render: (r) => <StatusPill label={r.status} tone={tone(r.status)} /> },
        ]}
        fields={[
          { key: "description", label: "Description", required: true, span: 2, suggestions: BILLING_DESCRIPTION_OPTIONS, onChange: (value) => {
            const meta = billingMetaFor(value);
            return meta ? ({ code: meta.code, category: meta.category, amount: String(meta.amount) } as never) : undefined;
          } },
          { key: "code", label: "Code" },
          { key: "category", label: "Category" },
          { key: "amount", label: "Amount ($)", type: "number" },
          { key: "status", label: "Status", type: "select", options: ["pending", "billed", "paid", "waived"] },
        ]}
        emptyDraft={{ description: "", code: "", category: "", amount: "", status: "pending" }}
        toDraft={(r) => ({ description: r.description, code: r.code ?? "", category: r.category ?? "", amount: r.amount != null ? String(r.amount) : "", status: r.status })}
        onAdd={(d) => addBillingItem({ encounterId, patientId, description: d.description, code: d.code || null, category: d.category || null, amount: d.amount ? Number(d.amount) : null, status: d.status as never }, mode)}
        onUpdate={(id, d) => updateBillingItem(id, { description: d.description, code: d.code || null, category: d.category || null, amount: d.amount ? Number(d.amount) : null, status: d.status as never }, mode)}
        onRemove={(id) => removeBillingItem(id, mode)}
      />
    </div>
  );
}

const ATTACHMENT_CATEGORY_OPTIONS = ["imaging", "document", "photo", "consent", "other"];

export function AttachmentsTab({ patientId, encounterId }: { patientId: string; encounterId: string }) {
  const mode = useAppStore((s) => s.mode) as Mode;
  const rows = useAttachments(encounterId);
  return (
    <DomainTab
      title="Attachments"
      subtitle="Documents, images and consent forms linked to this visit."
      icon={Paperclip}
      rows={rows}
      addLabel="Add attachment"
      columns={[
        { header: "Title", primary: true, render: (r) => r.title },
        { header: "Category", render: (r) => <StatusPill label={r.category} tone="primary" /> },
        { header: "File", render: (r) => r.fileName || "—" },
        { header: "Uploaded by", render: (r) => r.uploadedBy || "—" },
        { header: "Uploaded", render: (r) => fmtDateTime(r.uploadedAt) },
      ]}
      fields={[
        { key: "title", label: "Title", required: true, span: 2, suggestions: ATTACHMENT_TITLE_OPTIONS },
        { key: "category", label: "Category", type: "select", options: ATTACHMENT_CATEGORY_OPTIONS },
        { key: "fileName", label: "File name", placeholder: "report.pdf" },
        { key: "uploadedBy", label: "Uploaded by", placeholder: "Dr. / Registrar …" },
      ]}
      emptyDraft={{ title: "", category: "document", fileName: "", uploadedBy: "" }}
      toDraft={(r) => ({ title: r.title, category: r.category, fileName: r.fileName ?? "", uploadedBy: r.uploadedBy ?? "" })}
      onAdd={(d) => addAttachment({ encounterId, patientId, title: d.title, category: d.category as never, fileName: d.fileName || null, mimeType: null, blob: null, uploadedBy: d.uploadedBy || null }, mode)}
      onUpdate={(id, d) => updateAttachment(id, { title: d.title, category: d.category as never, fileName: d.fileName || null, uploadedBy: d.uploadedBy || null }, mode)}
      onRemove={(id) => removeAttachment(id, mode)}
    />
  );
}
