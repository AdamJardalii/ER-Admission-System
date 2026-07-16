import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

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
  options?: string[]; // for type "select"
  suggestions?: string[]; // inline dropdown suggestions for text inputs
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
  const firstFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

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
                    <select
                      ref={isFirst ? (firstFieldRef as React.RefObject<HTMLSelectElement>) : undefined}
                      className={inputClass}
                      value={value}
                      onChange={(e) => setField(field.key, e.target.value)}
                    >
                      {(!field.required || field.placeholder) && (
                        <option value="">{field.placeholder ?? "Select an option"}</option>
                      )}
                      {value && !(field.options ?? []).includes(value) && (
                        <option value={value}>{value.replace(/_/g, " ")}</option>
                      )}
                      {(field.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {option.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  ) : field.suggestions && field.type !== "number" && field.type !== "date" ? (
                    <SuggestionInput
                      inputRef={isFirst ? (firstFieldRef as React.RefObject<HTMLInputElement>) : undefined}
                      value={value}
                      placeholder={field.placeholder}
                      suggestions={field.suggestions}
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
  onChange,
  onSubmit,
}: {
  inputRef?: React.RefObject<HTMLInputElement>;
  value: string;
  placeholder?: string;
  suggestions: string[];
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const normalizedValue = value.trim().toLowerCase();
  const filtered = suggestions
    .filter((option) => !normalizedValue || option.toLowerCase().includes(normalizedValue))
    .slice(0, 8);
  const showMenu = open && filtered.length > 0;

  function choose(option: string) {
    onChange(option);
    setOpen(false);
    setHighlighted(0);
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className={inputClass}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showMenu}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
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
      {showMenu && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-52 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-card)]">
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
        </div>
      )}
    </div>
  );
}

/** Convenience close button reused by lightweight inline panels. */
export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Close" onClick={onClick} className="rounded-md border border-[var(--color-border)] p-1">
      <X size={14} />
    </button>
  );
}
