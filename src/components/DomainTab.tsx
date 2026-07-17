import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { DropdownSelect, FloatingDropdown, type DropdownOption } from "./FloatingDropdown";

// Reusable, config-driven domain panel: a dense table of records plus an inline
// add/edit form. Every first-class chart tab (medications, orders, results,
// conditions, procedures, immunizations, programs, billing, attachments) is one
// instance of this, so they stay visually and behaviourally consistent.

const inputClass =
  "min-h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]";

export type FieldType = "text" | "textarea" | "number" | "date" | "select";

export interface FieldSpec<Draft> {
  key: keyof Draft & string;
  label: string;
  type?: FieldType;
  placeholder?: string;
  options?: DropdownOption[]; // for type "select"
  suggestions?: string[]; // inline dropdown suggestions for text inputs
  catalogKind?: "medication" | "laboratory" | "result" | "procedure";
  required?: boolean;
  span?: 1 | 2; // grid column span in the form
  /** Called when this field changes; return partial draft to auto-fill siblings. */
  onChange?: (value: string, draft: Draft) => Partial<Draft> | void;
}

export type Tone = "primary" | "green" | "yellow" | "red" | "neutral";

export interface ColumnSpec<Row> {
  header: string;
  /** Primary column is never truncated and rendered with emphasis. */
  primary?: boolean;
  align?: "left" | "right";
  render: (row: Row) => React.ReactNode;
  className?: string;
}

const toneClass: Record<Tone, string> = {
  primary: "bg-[var(--color-primary-tint)] text-[var(--color-primary)]",
  green: "bg-[var(--color-green-tint)] text-[var(--color-green-text)]",
  yellow: "bg-[var(--color-yellow-tint)] text-[var(--color-yellow-text)]",
  red: "bg-[var(--color-red-tint)] text-[var(--color-red-text)]",
  neutral: "bg-[var(--color-surface-muted)] text-[var(--color-ink-secondary)]",
};

/** Small text+color status pill (never colour-only). */
export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold capitalize ${toneClass[tone]}`}>
      {label.replace(/_/g, " ")}
    </span>
  );
}

export interface DomainTabProps<Row extends { id: string }, Draft> {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  rows: Row[];
  columns: ColumnSpec<Row>[];
  fields: FieldSpec<Draft>[];
  emptyDraft: Draft;
  /** Build a Draft from an existing row for editing. */
  toDraft: (row: Row) => Draft;
  onAdd: (draft: Draft) => void | Promise<unknown>;
  onUpdate: (id: string, draft: Draft) => void | Promise<unknown>;
  onRemove: (id: string) => void | Promise<unknown>;
  addLabel?: string;
  /** Hides mutation controls while preserving the full table in chart view mode. */
  readOnly?: boolean;
  /** Minimum table width before horizontal scroll kicks in (px). */
  minTableWidth?: number;
}

export function DomainTab<Row extends { id: string }, Draft extends Record<string, unknown>>({
  title,
  subtitle,
  icon: Icon,
  rows,
  columns,
  fields,
  emptyDraft,
  toDraft,
  onAdd,
  onUpdate,
  onRemove,
  addLabel = "Add",
  readOnly = false,
  minTableWidth = 640,
}: DomainTabProps<Row, Draft>) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [justAdded, setJustAdded] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>(null);

  const requiredKeys = useMemo(() => fields.filter((f) => f.required).map((f) => f.key), [fields]);
  const canSave = requiredKeys.every((key) => String(draft[key] ?? "").trim().length > 0);

  useEffect(() => {
    if (!readOnly) return;
    setAdding(false);
    setEditingId(null);
    setJustAdded(false);
  }, [readOnly]);

  function focusFirstField() {
    window.setTimeout(() => firstFieldRef.current?.focus(), 0);
  }

  function startAdd() {
    setDraft(emptyDraft);
    setAdding(true);
    setEditingId(null);
    setJustAdded(false);
    focusFirstField();
  }

  function startEdit(row: Row) {
    setDraft(toDraft(row));
    setEditingId(row.id);
    setAdding(false);
    setJustAdded(false);
  }

  function cancel() {
    setAdding(false);
    setEditingId(null);
    setDraft(emptyDraft);
    setJustAdded(false);
  }

  // Adding stays open afterward so the user can enter several records (e.g.
  // multiple medications, allergies, or lab orders) back-to-back without
  // reopening the form each time. Editing an existing row still closes it.
  async function save() {
    if (!canSave) return;
    if (editingId) {
      await onUpdate(editingId, draft);
      cancel();
    } else {
      await onAdd(draft);
      setDraft(emptyDraft);
      setJustAdded(true);
      window.setTimeout(() => setJustAdded(false), 1400);
      focusFirstField();
    }
  }

  function setField(key: keyof Draft & string, value: string) {
    setDraft((current) => {
      const next = { ...current, [key]: value } as Draft;
      const field = fields.find((f) => f.key === key);
      const patch = field?.onChange?.(value, next);
      return patch ? ({ ...next, ...patch } as Draft) : next;
    });
  }

  const formOpen = adding || editingId !== null;

  return (
    <section className="card">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {Icon && <Icon size={17} className="text-[var(--color-primary)]" />}
        <div className="mr-auto">
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-[var(--color-ink-secondary)]">{subtitle}</p>}
        </div>
        <span className="rounded-md bg-[var(--color-surface-muted)] px-2.5 py-1 text-sm font-semibold">
          {rows.length}
        </span>
        {!readOnly && !formOpen && (
          <button
            type="button"
            onClick={startAdd}
            className="inline-flex min-h-10 items-center gap-1 rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white"
          >
            <Plus size={15} /> {addLabel}
          </button>
        )}
      </div>

      {!readOnly && formOpen && (
        <div className="mb-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2.5">
          {!editingId && (
            <p className="mb-2 text-xs text-[var(--color-ink-secondary)]">
              Add as many as needed — the form stays open after each save.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 max-[560px]:grid-cols-1">
            {fields.map((field, index) => {
              const value = String(draft[field.key] ?? "");
              const isFirst = index === 0;
              return (
                <label key={field.key} className={`block ${field.span === 2 ? "col-span-2 max-[560px]:col-span-1" : ""}`}>
                  <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-secondary)]">
                    {field.label}
                    {field.required && <span className="text-[var(--color-red-solid)]"> *</span>}
                  </span>
                  {field.type === "textarea" ? (
                    <textarea
                      ref={isFirst ? (firstFieldRef as React.RefObject<HTMLTextAreaElement>) : undefined}
                      className={`${inputClass} resize-none`}
                      rows={2}
                      value={value}
                      placeholder={field.placeholder}
                      onChange={(e) => setField(field.key, e.target.value)}
                    />
                  ) : field.type === "select" ? (
                    <DropdownSelect
                      ref={isFirst ? (firstFieldRef as React.RefObject<HTMLButtonElement>) : undefined}
                      className={inputClass}
                      value={value}
                      placeholder={!field.required || field.placeholder ? field.placeholder ?? "Select an option" : undefined}
                      options={field.options ?? []}
                      onChange={(nextValue) => setField(field.key, nextValue)}
                    />
                  ) : field.suggestions && field.type !== "number" && field.type !== "date" ? (
                    <SuggestionInput
                      inputRef={isFirst ? (firstFieldRef as React.RefObject<HTMLInputElement>) : undefined}
                      value={value}
                      placeholder={field.placeholder}
                      suggestions={field.suggestions}
                      catalogKind={field.catalogKind}
                      label={field.label}
                      onChange={(nextValue) => setField(field.key, nextValue)}
                      onSubmit={() => void save()}
                    />
                  ) : (
                    <input
                      ref={isFirst ? (firstFieldRef as React.RefObject<HTMLInputElement>) : undefined}
                      className={inputClass}
                      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                      value={value}
                      placeholder={field.placeholder}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void save();
                        }
                      }}
                      onChange={(e) => setField(field.key, e.target.value)}
                    />
                  )}
                </label>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            {justAdded && <span className="mr-auto inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-green-text)]"><Check size={14} /> Added</span>}
            <button type="button" onClick={cancel} className="min-h-10 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold">
              {editingId ? "Cancel" : "Done"}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!canSave}
              className="min-h-10 rounded-md bg-[var(--color-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {editingId ? "Save changes" : "Add"}
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 && !formOpen ? (
        <p className="py-6 text-center text-sm text-[var(--color-ink-secondary)]">Nothing recorded yet.</p>
      ) : rows.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-md border border-[var(--color-border)] max-[720px]:hidden">
            <table className="w-full border-collapse" style={{ minWidth: minTableWidth }}>
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-left">
                  {columns.map((col) => (
                    <th key={col.header} className={`px-3 py-2 ${col.primary ? "min-w-[180px]" : ""} ${col.align === "right" ? "text-right" : ""}`}>
                      {col.header}
                    </th>
                  ))}
                  {!readOnly && <th className="w-24 px-3 py-2 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-primary-tint)]">
                    {columns.map((col) => (
                      <td
                        key={col.header}
                        className={`px-3 py-2.5 align-top ${col.align === "right" ? "text-right tabular-nums" : ""} ${
                          col.primary ? "min-w-[180px] font-semibold" : col.className ?? "text-[var(--color-ink-secondary)]"
                        }`}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                    {!readOnly && (
                      <td className="px-3 py-2 text-right">
                        <RowActions title={title} row={row} onEdit={startEdit} onRemove={onRemove} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="hidden space-y-2 max-[720px]:block">
            {rows.map((row) => (
              <article key={row.id} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <dl className="space-y-2">
                  {columns.map((column) => (
                    <div key={column.header} className="grid grid-cols-[112px_minmax(0,1fr)] gap-2 text-sm">
                      <dt className="text-xs font-semibold text-[var(--color-ink-secondary)]">{column.header}</dt>
                      <dd className={`min-w-0 break-words ${column.primary ? "font-semibold" : ""}`}>{column.render(row)}</dd>
                    </div>
                  ))}
                </dl>
                {!readOnly && <div className="mt-3 flex justify-end"><RowActions title={title} row={row} onEdit={startEdit} onRemove={onRemove} /></div>}
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function RowActions<Row extends { id: string }>({
  title,
  row,
  onEdit,
  onRemove,
}: {
  title: string;
  row: Row;
  onEdit: (row: Row) => void;
  onRemove: (id: string) => void | Promise<unknown>;
}) {
  return (
    <div className="flex justify-end gap-1">
      <button
        type="button"
        aria-label={`Edit ${title} entry`}
        onClick={() => onEdit(row)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-ink-secondary)] hover:text-[var(--color-primary)]"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        aria-label={`Remove ${title} entry`}
        onClick={() => void onRemove(row.id)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-ink-secondary)] hover:text-[var(--color-red-solid)]"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export function SuggestionInput({
  inputRef,
  value,
  placeholder,
  suggestions,
  catalogKind,
  label = "Catalog",
  onChange,
  onSubmit,
}: {
  inputRef?: React.RefObject<HTMLInputElement | null>;
  value: string;
  placeholder?: string;
  suggestions: string[];
  catalogKind?: FieldSpec<Record<string, unknown>>["catalogKind"];
  label?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(value);
  const triggerRef = useRef<HTMLInputElement | null>(null);
  const normalizedQuery = (open ? query : value).trim().toLowerCase();
  const filtered = suggestions.filter((option) => !normalizedQuery || option.toLowerCase().includes(normalizedQuery));
  const categories = catalogCategories(catalogKind, suggestions);
  const [category, setCategory] = useState(categories[0]?.id ?? "all");
  const categoryFiltered = category === "all" ? filtered : filtered.filter((option) => catalogCategoryFor(catalogKind, option) === category);
  const currentResults = categoryFiltered.length ? categoryFiltered : filtered;
  const showFullscreen = Boolean(catalogKind);
  const showMenu = !showFullscreen && open && filtered.length > 0;

  useEffect(() => {
    if (open) {
      setQuery(value);
      setSelected(value);
      setHighlighted(0);
    }
  }, [open, value]);

  useEffect(() => {
    if (!open || !showFullscreen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, showFullscreen]);

  function choose(option: string) {
    onChange(option);
    setSelected(option);
    setOpen(false);
    setHighlighted(0);
  }

  function applySelection() {
    onChange(selected || query.trim());
    setOpen(false);
    setHighlighted(0);
  }

  return (
    <div className="relative">
      <div className="domain-catalog-field">
        <input
          ref={(node) => {
            triggerRef.current = node;
            if (inputRef) inputRef.current = node;
          }}
          className={inputClass}
          type="text"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          onFocus={() => {
            if (!showFullscreen) setOpen(true);
          }}
          onBlur={() => {
            if (!showFullscreen) window.setTimeout(() => setOpen(false), 120);
          }}
          onChange={(e) => {
            onChange(e.target.value);
            if (!showFullscreen) setOpen(true);
            setHighlighted(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setHighlighted((current) => Math.min(current + 1, Math.max(0, filtered.length - 1)));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlighted((current) => Math.max(current - 1, 0));
              return;
            }
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (showMenu && filtered[highlighted]) choose(filtered[highlighted]);
              else onSubmit();
            }
          }}
        />
        {showFullscreen && (
          <button type="button" onClick={() => setOpen(true)} aria-label={`Open ${label} catalog`}>
            <Search size={14} /> Browse <ChevronDown size={14} />
          </button>
        )}
      </div>
      {showMenu && (
        <FloatingDropdown
          open={showMenu}
          triggerRef={triggerRef}
          matchTriggerWidth
          role="listbox"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-card)]"
        >
          {filtered.map((option, index) => (
            <button
              key={option}
              type="button"
              className={`block w-full px-2.5 py-1.5 text-left text-sm ${
                index === highlighted ? "bg-[var(--color-primary-tint)] text-[var(--color-primary)]" : "hover:bg-[var(--color-surface-muted)]"
              }`}
              onMouseEnter={() => setHighlighted(index)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(option)}
            >
              {option}
            </button>
          ))}
        </FloatingDropdown>
      )}
      {showFullscreen && open && createPortal(
        <div className="domain-catalog-modal" role="dialog" aria-modal="true" aria-label={`${label} catalog`}>
          <div className="domain-catalog-shell">
            <header className="domain-catalog-header">
              <div>
                <h2>{catalogTitle(catalogKind, label)}</h2>
                <p>{catalogSubtitle(catalogKind)}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)}><X size={15} /> Close</button>
            </header>
            <div className="domain-catalog-search">
              <Search size={16} />
              <input
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlighted(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setOpen(false);
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setHighlighted((current) => Math.min(current + 1, Math.max(0, currentResults.length - 1)));
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setHighlighted((current) => Math.max(current - 1, 0));
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const next = currentResults[highlighted] ?? query.trim();
                    if (next) {
                      setSelected(next);
                      onChange(next);
                      setOpen(false);
                    }
                  }
                }}
                placeholder={catalogSearchPlaceholder(catalogKind)}
              />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
            </div>
            <div className="domain-catalog-body">
              <nav className="domain-catalog-categories" aria-label={`${label} categories`}>
                {categories.map((item) => (
                  <button key={item.id} type="button" aria-current={category === item.id ? "true" : undefined} onClick={() => { setCategory(item.id); setHighlighted(0); }}>
                    <span>{item.label}</span>
                    <em>{item.count}</em>
                  </button>
                ))}
              </nav>
              <section className="domain-catalog-results">
                <div className="domain-catalog-toolbar">
                  <strong>{categories.find((item) => item.id === category)?.label ?? "All"}</strong>
                  <span>{currentResults.length} result{currentResults.length === 1 ? "" : "s"}</span>
                </div>
                <div className="domain-catalog-grid" role="listbox">
                  {currentResults.map((option, index) => {
                    const active = option === selected || option === value;
                    return (
                      <button
                        key={option}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`${active ? "domain-catalog-selected" : ""} ${index === highlighted ? "domain-catalog-active" : ""}`}
                        onMouseEnter={() => setHighlighted(index)}
                        onClick={() => {
                          setSelected(option);
                          onChange(option);
                        }}
                      >
                        <span>{option}</span>
                        <em>{catalogCategoryLabel(catalogKind, option)}</em>
                      </button>
                    );
                  })}
                  {currentResults.length === 0 && query.trim() && (
                    <button type="button" className="domain-catalog-free-text" onClick={() => { setSelected(query.trim()); onChange(query.trim()); }}>
                      Use "{query.trim()}"
                    </button>
                  )}
                </div>
              </section>
              <aside className="domain-catalog-selected-rail">
                <h3>Selected</h3>
                {selected || value ? <strong>{selected || value}</strong> : <p>No selection yet.</p>}
                {query.trim() && !suggestions.some((item) => item.toLowerCase() === query.trim().toLowerCase()) && (
                  <button type="button" onClick={() => { setSelected(query.trim()); onChange(query.trim()); }}>Use typed text</button>
                )}
              </aside>
            </div>
            <footer className="domain-catalog-footer">
              <span>{selected || value || "No selection"}</span>
              <button type="button" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" onClick={applySelection}>Apply</button>
            </footer>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

type CatalogCategory = { id: string; label: string; count: number };

function catalogCategories(kind: FieldSpec<Record<string, unknown>>["catalogKind"], options: string[]): CatalogCategory[] {
  const counts = new Map<string, number>();
  for (const option of options) {
    const category = catalogCategoryFor(kind, option);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [{ id: "all", label: "All", count: options.length }, ...Array.from(counts.entries()).map(([id, count]) => ({ id, label: catalogCategoryName(kind, id), count }))];
}

function catalogCategoryFor(kind: FieldSpec<Record<string, unknown>>["catalogKind"], option: string) {
  const lower = option.toLowerCase();
  if (kind === "medication") {
    if (lower.includes("insulin") || lower.includes("metformin")) return "endocrine";
    if (lower.includes("inhaler") || lower.includes("salbutamol")) return "respiratory";
    if (lower.includes("aspirin") || lower.includes("warfarin") || lower.includes("statin") || lower.includes("amlodipine") || lower.includes("lisinopril") || lower.includes("bisoprolol")) return "cardiovascular";
    return "general";
  }
  if (kind === "laboratory" || kind === "result") {
    if (lower.includes("troponin") || lower.includes("ecg")) return "cardiac";
    if (lower.includes("blood") || lower.includes("cbc") || lower.includes("hemoglobin") || lower.includes("platelets")) return "hematology";
    if (lower.includes("metabolic") || lower.includes("sodium") || lower.includes("potassium") || lower.includes("creatinine") || lower.includes("glucose")) return "chemistry";
    if (lower.includes("urinalysis") || lower.includes("hcg")) return "urine";
    return "general";
  }
  if (kind === "procedure") {
    if (lower.includes("wound") || lower.includes("laceration") || lower.includes("incision")) return "wound";
    if (lower.includes("fracture") || lower.includes("joint") || lower.includes("cast")) return "orthopedic";
    if (lower.includes("intubation")) return "airway";
    if (lower.includes("line") || lower.includes("cannulation")) return "vascular";
    return "general";
  }
  return "general";
}

function catalogCategoryName(_kind: FieldSpec<Record<string, unknown>>["catalogKind"], id: string) {
  const names: Record<string, string> = {
    all: "All",
    general: "General",
    cardiovascular: "Cardiovascular",
    respiratory: "Respiratory",
    endocrine: "Endocrine",
    cardiac: "Cardiac",
    hematology: "Hematology",
    chemistry: "Chemistry",
    urine: "Urine",
    wound: "Wound care",
    orthopedic: "Orthopedic",
    airway: "Airway",
    vascular: "Vascular access",
  };
  return names[id] ?? id;
}

function catalogCategoryLabel(kind: FieldSpec<Record<string, unknown>>["catalogKind"], option: string) {
  return catalogCategoryName(kind, catalogCategoryFor(kind, option));
}

function catalogTitle(kind: FieldSpec<Record<string, unknown>>["catalogKind"], label: string) {
  if (kind === "medication") return "Medication catalog";
  if (kind === "laboratory") return "Laboratory order catalog";
  if (kind === "result") return "Result catalog";
  if (kind === "procedure") return "Procedure catalog";
  return `${label} catalog`;
}

function catalogSubtitle(kind: FieldSpec<Record<string, unknown>>["catalogKind"]) {
  if (kind === "medication") return "Search and select a medication while preserving typed custom entries.";
  if (kind === "laboratory") return "Search common laboratory and diagnostic orders.";
  if (kind === "result") return "Select a result test; known units and reference ranges still autofill.";
  if (kind === "procedure") return "Search common ED procedures and interventions.";
  return "Search catalog values or use typed text.";
}

function catalogSearchPlaceholder(kind: FieldSpec<Record<string, unknown>>["catalogKind"]) {
  if (kind === "medication") return "Search medication, dose, or class";
  if (kind === "laboratory") return "Search lab, imaging, or diagnostic order";
  if (kind === "result") return "Search test name, analyte, or panel";
  if (kind === "procedure") return "Search procedure, intervention, or site";
  return "Search catalog";
}

/** Convenience close button reused by lightweight inline panels. */
export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Close" onClick={onClick} className="rounded-md border border-[var(--color-border)] p-1">
      <X size={14} />
    </button>
  );
}
