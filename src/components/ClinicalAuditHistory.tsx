import type { AuditEvent } from "../types";

export function ClinicalAuditHistory({ events, title = "History" }: { events: AuditEvent[]; title?: string }) {
  return (
    <section className="clinical-detail-section">
      <h3>{title}</h3>
      {events.length === 0 ? (
        <p className="p-3 text-xs text-[var(--color-ink-secondary)]">No workflow changes recorded.</p>
      ) : (
        <ol className="clinical-audit-list">
          {events.slice(0, 12).map((event) => (
            <li key={event.id}>
              <div className="flex items-start justify-between gap-2">
                <strong>{event.action.replace(/_/g, " ")}</strong>
                <time dateTime={new Date(event.timestamp).toISOString()}>{formatAuditTime(event.timestamp)}</time>
              </div>
              <p>{event.actor ?? "System"}</p>
              {(event.previousValue || event.newValue) && (
                <p>{event.previousValue ?? "Not set"} to {event.newValue ?? "Not set"}</p>
              )}
              {event.reason && <p>Reason: {event.reason}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function formatAuditTime(timestamp: number) {
  return new Date(timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
