import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ListFilter, RefreshCw, X } from "lucide-react";

export function ClinicalWorklist({
  title,
  description,
  count,
  updatedAt,
  primaryAction,
  filters,
  filtersActive = false,
  loading,
  error,
  onRetry,
  emptyMessage,
  hasRows,
  children,
  drawer,
  onCloseDrawer,
}: {
  title: string;
  description: string;
  count: number;
  updatedAt: number | null;
  primaryAction?: { label: string; icon?: ReactNode; onClick: () => void };
  filters: ReactNode;
  filtersActive?: boolean;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  emptyMessage: string;
  hasRows: boolean;
  children: ReactNode;
  drawer?: ReactNode;
  onCloseDrawer?: () => void;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const filterPanelId = useId();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const closeDrawerRef = useRef(onCloseDrawer);
  closeDrawerRef.current = onCloseDrawer;
  const drawerOpen = Boolean(drawer && onCloseDrawer);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawerRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyboard);
    return () => {
      document.removeEventListener("keydown", handleKeyboard);
      document.body.style.overflow = previousBodyOverflow;
      previouslyFocused?.focus();
    };
  }, [drawerOpen]);

  return (
    <main className="clinical-workspace">
      <header className="clinical-workspace-header">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold">{title}</h1>
            <span className="rounded bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs font-semibold tabular-nums">{count}</span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--color-ink-secondary)]">
            {description} | Updated {updatedAt ? new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "pending"}
          </p>
        </div>
        {primaryAction && (
          <button type="button" onClick={primaryAction.onClick} className="clinical-workspace-primary">
            {primaryAction.icon}{primaryAction.label}
          </button>
        )}
      </header>

      <button
        type="button"
        onClick={() => setMobileFiltersOpen((open) => !open)}
        className="clinical-filter-toggle"
        aria-expanded={mobileFiltersOpen}
        aria-controls={filterPanelId}
      >
        <span className="inline-flex items-center gap-2"><ListFilter size={16} /> Filters</span>
        <span className="inline-flex items-center gap-2">
          {filtersActive && <span className="clinical-filter-active-label">Active</span>}
          <ChevronDown size={16} className={mobileFiltersOpen ? "rotate-180" : ""} />
        </span>
      </button>

      <section id={filterPanelId} className="clinical-filter-bar" data-mobile-open={mobileFiltersOpen} aria-label={`${title} filters`}>
        {filters}
      </section>

      <section className="clinical-worklist-body" aria-live="polite" aria-busy={loading}>
        {error ? (
          <div role="alert" className="clinical-worklist-state">
            <strong>{title} could not be loaded.</strong>
            <span className="text-[var(--color-ink-secondary)]">{error}</span>
            <button type="button" onClick={onRetry} className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold">
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        ) : loading ? (
          <div className="clinical-worklist-skeleton" aria-label={`Loading ${title.toLowerCase()}`}>
            {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
          </div>
        ) : !hasRows ? (
          <div className="clinical-worklist-state text-[var(--color-ink-secondary)]">{emptyMessage}</div>
        ) : children}
      </section>

      {drawer && onCloseDrawer && (
        <div className="clinical-drawer-layer" role="dialog" aria-modal="true" aria-label={`${title} details`}>
          <button type="button" className="clinical-drawer-backdrop" onClick={onCloseDrawer} aria-label="Close details" />
          <aside ref={drawerRef} className="clinical-drawer">
            <div className="flex min-h-12 items-center justify-between border-b border-[var(--color-border)] px-4">
              <strong>{title} details</strong>
              <button ref={closeButtonRef} type="button" onClick={onCloseDrawer} className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-[var(--color-surface-muted)]" aria-label="Close details">
                <X size={19} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">{drawer}</div>
          </aside>
        </div>
      )}
    </main>
  );
}
