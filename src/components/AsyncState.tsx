import { AlertCircle, Inbox, LoaderCircle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingState({ label = "Loading data" }: { label?: string }) {
  return (
    <div className="async-state" role="status" aria-live="polite">
      <LoaderCircle className="animate-spin" size={18} aria-hidden="true" />
      <span>{label}</span>
      <span className="sr-only">Please wait.</span>
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="async-state async-state-error" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <span className="min-w-0 flex-1">{message}</span>
      {retry && (
        <button type="button" className="button button-secondary" onClick={retry}>
          <RotateCw size={15} aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="async-state async-state-empty">
      <Inbox size={18} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[var(--color-ink)]">{title}</p>
        {detail && <p className="text-xs text-[var(--color-ink-secondary)]">{detail}</p>}
      </div>
      {action}
    </div>
  );
}
