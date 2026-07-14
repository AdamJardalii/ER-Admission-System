import { useEffect, useState } from "react";
import { db } from "../../db/db";
import { useReconciliationItems, useEncounterView } from "../../db/hooks";
import { updatePatientField, updateEncounterField, setTriage, assignLocation } from "../../db/repo";
import { writeAudit } from "../../db/audit";
import { useAppStore } from "../../store/useAppStore";
import { AiChip } from "../../components/AiChip";
import { TriageBadge } from "../../components/TriageBadge";
import type { ReconciliationItem, StartColor } from "../../types";

const ISSUE_LABEL: Record<string, string> = {
  unknown_identity: "Unknown identity",
  paper_not_linked: "Paper not linked",
  voice_unreviewed: "Voice unreviewed",
  location_missing: "Location missing",
  possible_duplicate: "Possible duplicate",
};

export function ReconciliationWorkspace() {
  const items = useReconciliationItems();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Pick an initial item once the list loads, but never override an existing
  // selection — otherwise accepting/rejecting the selected item (which changes
  // its status) would silently reassign `selected` to a different pending item.
  useEffect(() => {
    if (selectedId === null && items.length > 0) {
      const firstPending = items.find((i) => i.status === "pending") ?? items[0];
      setSelectedId(firstPending.id);
    }
  }, [items, selectedId]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-[1440px] p-3">
      <h1 className="mb-3 text-lg font-semibold">Reconciliation workspace</h1>
      <div className="grid h-[calc(100vh-120px)] grid-cols-[260px_1fr_320px] gap-3">
        <QueuePane items={items} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
        {selected ? (
          <>
            <EvidencePane item={selected} />
            <SuggestionPane item={selected} />
          </>
        ) : (
          <div className="col-span-2 card flex items-center justify-center text-sm text-[var(--color-ink-secondary)]">
            No reconciliation items — incomplete records appear here.
          </div>
        )}
      </div>
    </div>
  );
}

function QueuePane({
  items,
  selectedId,
  onSelect,
}: {
  items: ReconciliationItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="card overflow-auto">
      <h2 className="mb-2 text-sm font-semibold">Queue</h2>
      {items.length === 0 ? (
        <div className="text-sm text-[var(--color-ink-secondary)]">
          No incomplete records — new ones appear here.
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`w-full rounded-md border px-2 py-1.5 text-left text-sm ${
                selectedId === item.id
                  ? "border-[var(--color-primary)] bg-[var(--color-primary-tint)]"
                  : "border-transparent hover:bg-[var(--color-surface-muted)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <ItemPatientLabel encounterId={item.encounterId} />
                <StatusDot status={item.status} />
              </div>
              <div className="text-xs text-[var(--color-ink-secondary)]">
                {ISSUE_LABEL[item.issueType]}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "resolved"
      ? "var(--color-green-solid)"
      : status === "manual_review"
        ? "var(--color-yellow-solid)"
        : "var(--color-ink-secondary)";
  return <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />;
}

function ItemPatientLabel({ encounterId }: { encounterId: string }) {
  const view = useEncounterView(encounterId);
  return <span className="font-medium">{view?.patient.displayNumber ?? "…"}</span>;
}

function EvidencePane({ item }: { item: ReconciliationItem }) {
  const view = useEncounterView(item.encounterId);
  if (!view) return <div className="card" />;

  return (
    <div className="card space-y-3 overflow-auto">
      <h2 className="text-sm font-semibold">Evidence</h2>

      {item.paperNoteImage && (
        <div>
          <div className="text-xs text-[var(--color-ink-secondary)] mb-1.5">Paper note</div>
          <div
            className="rounded-md border border-[var(--color-border)] p-3"
            style={{
              background: "var(--color-note-bg)",
              fontFamily: "cursive",
              minHeight: 140,
              lineHeight: 1.7,
              color: "var(--color-note-ink)",
            }}
          >
            {item.suggested.extractedNote}
          </div>
        </div>
      )}

      {item.issueType === "voice_unreviewed" && (
        <div>
          <div className="text-xs text-[var(--color-ink-secondary)] mb-1.5">Voice note</div>
          <div className="flex items-center gap-3 rounded-md border border-[var(--color-border)] p-2.5">
            <button className="w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: "var(--color-primary)" }}>
              ▶
            </button>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
              <div className="h-full rounded-full w-1/3" style={{ background: "var(--color-primary)" }} />
            </div>
            <span className="text-xs text-[var(--color-ink-secondary)]">0:12</span>
          </div>
        </div>
      )}

      <div>
        <div className="text-xs text-[var(--color-ink-secondary)] mb-1.5">Location + timestamp</div>
        <div className="space-y-1 rounded-md border border-[var(--color-border)] p-2.5 text-sm">
          <div>Location: {view.encounter.currentLocationName ?? "Not recorded"}</div>
          <div>Arrived: {new Date(view.encounter.arrivedAt).toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

function SuggestionPane({ item }: { item: ReconciliationItem }) {
  const view = useEncounterView(item.encounterId);
  const mode = useAppStore((s) => s.mode);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(item.suggested);

  if (!view) return <div className="card" />;

  const resolved = item.status !== "pending";

  async function accept(values: typeof item.suggested) {
    const { patient, encounter } = view!;
    if (values.identityMatch) {
      const nameGuess = values.identityMatch.match(/Possible match: ([^(]+)/)?.[1]?.trim();
      if (nameGuess) {
        await updatePatientField(patient.id, "name", nameGuess, mode);
        await updatePatientField(patient.id, "identityStatus", "provisional", mode);
      }
    }
    if (values.estimatedAge) {
      await updatePatientField(patient.id, "estimatedAgeRange", values.estimatedAge, mode);
    }
    if (values.triage) {
      await setTriage(encounter.id, "start", values.triage as StartColor, mode, "Accepted from reconciliation");
    }
    if (values.location) {
      await assignLocation(encounter.id, values.location, "zone-trauma", mode);
    }
    if (values.extractedNote) {
      await updateEncounterField(encounter.id, "chiefComplaint", values.extractedNote, mode);
    }
    await db.reconciliationItems.update(item.id, { status: "resolved", suggested: values });
    await writeAudit({
      entityType: "reconciliationItem",
      entityId: item.id,
      action: "accepted",
      mode,
    });
    setEditing(false);
  }

  async function reject() {
    await db.reconciliationItems.update(item.id, { status: "manual_review" });
    await writeAudit({
      entityType: "reconciliationItem",
      entityId: item.id,
      action: "rejected",
      mode,
    });
  }

  return (
    <div className="card space-y-3 overflow-auto">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Suggested data</h2>
        <AiChip />
      </div>
      <p className="text-xs text-[var(--color-ink-secondary)]">Advisory only</p>

      {resolved && (
        <div
          className="text-xs rounded-lg px-2.5 py-1.5"
          style={{
            background: item.status === "resolved" ? "var(--color-green-tint)" : "var(--color-yellow-tint)",
            color: item.status === "resolved" ? "var(--color-green-text)" : "var(--color-yellow-text)",
          }}
        >
          {item.status === "resolved" ? "Accepted into record" : "Marked for manual review"}
        </div>
      )}

      <div className="space-y-3">
        <SuggestionRow
          label="Identity match"
          value={form.identityMatch}
          editing={editing}
          onChange={(v) => setForm((f) => ({ ...f, identityMatch: v }))}
        />
        <SuggestionRow
          label="Estimated age"
          value={form.estimatedAge}
          editing={editing}
          onChange={(v) => setForm((f) => ({ ...f, estimatedAge: v }))}
        />
        <div>
          <div className="text-xs text-[var(--color-ink-secondary)] mb-1">Triage</div>
          {editing ? (
            <select
              value={form.triage ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, triage: e.target.value }))}
              className="w-full text-sm border border-[var(--color-border)] rounded-lg px-2 py-1.5 outline-none"
            >
              <option value="">—</option>
              <option value="red">Red</option>
              <option value="yellow">Yellow</option>
              <option value="green">Green</option>
              <option value="black">Black</option>
            </select>
          ) : form.triage ? (
            <TriageBadge level={form.triage as StartColor} size="sm" />
          ) : (
            <span className="text-sm text-[var(--color-ink-secondary)]">—</span>
          )}
        </div>
        <SuggestionRow
          label="Location"
          value={form.location}
          editing={editing}
          onChange={(v) => setForm((f) => ({ ...f, location: v }))}
        />
        <div>
          <div className="text-xs text-[var(--color-ink-secondary)] mb-1">Extracted note</div>
          {editing ? (
            <textarea
              value={form.extractedNote ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, extractedNote: e.target.value }))}
              rows={3}
              className="w-full text-sm border border-[var(--color-border)] rounded-lg px-2 py-1.5 outline-none resize-none"
            />
          ) : (
            <p className="text-sm">{form.extractedNote || "—"}</p>
          )}
        </div>
      </div>

      {!resolved && (
        <div className="flex gap-2 pt-2">
          {editing ? (
            <button
              onClick={() => accept(form)}
              className="flex-1 rounded-lg py-2 text-sm font-medium text-white"
              style={{ background: "var(--color-primary)" }}
            >
              Save
            </button>
          ) : (
            <>
              <button
                onClick={() => accept(form)}
                className="flex-1 rounded-lg py-2 text-sm font-medium text-white"
                style={{ background: "var(--color-primary)" }}
              >
                Accept
              </button>
              <button
                onClick={() => setEditing(true)}
                className="flex-1 rounded-lg py-2 text-sm border border-[var(--color-border)]"
              >
                Edit
              </button>
              <button
                onClick={reject}
                className="flex-1 rounded-lg py-2 text-sm border border-[var(--color-red-solid)] text-[var(--color-red-text)]"
              >
                Reject
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SuggestionRow({
  label,
  value,
  editing,
  onChange,
}: {
  label: string;
  value: string | null;
  editing: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-xs text-[var(--color-ink-secondary)] mb-1">{label}</div>
      {editing ? (
        <input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-sm border border-[var(--color-border)] rounded-lg px-2 py-1.5 outline-none"
        />
      ) : (
        <p className="text-sm">{value || "—"}</p>
      )}
    </div>
  );
}
