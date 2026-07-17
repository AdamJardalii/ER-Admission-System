import { ChevronDown } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

const VIEWPORT_MARGIN = 8;
const MENU_FLOOR = 160;

type FloatingDropdownLayout = {
  left: number;
  top: number;
  width?: number;
  maxHeight: number;
  scrollable: boolean;
  ready: boolean;
};

export function FloatingDropdown({
  open,
  triggerRef,
  children,
  align = "start",
  matchTriggerWidth = false,
  minWidth,
  maxWidth,
  minHeight = MENU_FLOOR,
  gap = 4,
  className = "",
  style,
  role,
  ariaLabel,
  ariaLabelledBy,
  id,
  contentRef,
  onMouseDown,
  onClick,
}: {
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  children: React.ReactNode;
  align?: "start" | "end";
  matchTriggerWidth?: boolean;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  gap?: number;
  className?: string;
  style?: CSSProperties;
  role?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  id?: string;
  contentRef?: Ref<HTMLDivElement>;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}) {
  const internalRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<FloatingDropdownLayout>({
    left: 0,
    top: 0,
    maxHeight: minHeight,
    scrollable: false,
    ready: false,
  });

  const setContentRef = useCallback(
    (node: HTMLDivElement | null) => {
      internalRef.current = node;
      assignRef(contentRef, node);
    },
    [contentRef],
  );

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = internalRef.current;
    if (!trigger || !menu) return;

    const triggerRect = trigger.getBoundingClientRect();
    const availableBelow = Math.max(0, window.innerHeight - triggerRect.bottom - VIEWPORT_MARGIN);
    const availableAbove = Math.max(0, triggerRect.top - VIEWPORT_MARGIN);
    const openUp = availableBelow < minHeight && availableAbove > availableBelow;
    const availableSpace = openUp ? availableAbove : availableBelow;
    const contentHeight = Math.max(1, Math.ceil(menu.scrollHeight));
    const maxHeight = Math.max(1, Math.min(contentHeight, availableSpace));
    const renderedHeight = Math.min(contentHeight, maxHeight);
    const measuredWidth = Math.ceil(menu.offsetWidth || minWidth || triggerRect.width);
    const width = matchTriggerWidth ? triggerRect.width : undefined;
    const layoutWidth = width ?? measuredWidth;
    const rawLeft = align === "end" ? triggerRect.right - layoutWidth : triggerRect.left;
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - layoutWidth - VIEWPORT_MARGIN);
    const left = Math.min(Math.max(VIEWPORT_MARGIN, rawLeft), maxLeft);
    const top = openUp
      ? Math.max(VIEWPORT_MARGIN, triggerRect.top - gap - renderedHeight)
      : Math.min(triggerRect.bottom + gap, Math.max(VIEWPORT_MARGIN, window.innerHeight - renderedHeight - VIEWPORT_MARGIN));

    const next: FloatingDropdownLayout = {
      left: Math.round(left),
      top: Math.round(top),
      width,
      maxHeight,
      scrollable: contentHeight > maxHeight + 1,
      ready: true,
    };

    setLayout((current) =>
      current.left === next.left
      && current.top === next.top
      && current.width === next.width
      && current.maxHeight === next.maxHeight
      && current.scrollable === next.scrollable
      && current.ready === next.ready
        ? current
        : next,
    );
  }, [align, gap, matchTriggerWidth, minHeight, minWidth, triggerRef]);

  useLayoutEffect(() => {
    if (open) updatePosition();
  });

  useEffect(() => {
    if (!open) return undefined;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  if (!open) return null;

  return createPortal(
    <div
      ref={setContentRef}
      id={id}
      role={role}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={`fixed z-[100] ${className}`}
      style={{
        ...style,
        left: layout.left,
        top: layout.top,
        width: layout.width,
        minWidth,
        maxWidth,
        maxHeight: layout.maxHeight,
        overflowY: layout.scrollable ? "auto" : "visible",
        visibility: layout.ready ? "visible" : "hidden",
      }}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      {children}
    </div>,
    document.body,
  );
}

export type DropdownOption = string | { value: string; label: string };

export const DropdownSelect = forwardRef<HTMLButtonElement, {
  id?: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  listboxId?: string;
  ariaLabel?: string;
}>(
  function DropdownSelect({
    id,
    value,
    options,
    onChange,
    placeholder,
    className = "",
    listboxId,
    ariaLabel,
  }, forwardedRef) {
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [open, setOpen] = useState(false);
    const normalizedOptions = useMemo(
      () => options.map((option) => typeof option === "string" ? { value: option, label: formatOptionLabel(option) } : option),
      [options],
    );
    const menuOptions = useMemo(() => {
      const hasCurrentValue = value && !normalizedOptions.some((option) => option.value === value);
      const current = hasCurrentValue ? [{ value, label: formatOptionLabel(value) }] : [];
      const placeholderOption = placeholder ? [{ value: "", label: placeholder }] : [];
      return [...placeholderOption, ...current, ...normalizedOptions];
    }, [normalizedOptions, placeholder, value]);
    const selectedIndex = Math.max(0, menuOptions.findIndex((option) => option.value === value));
    const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex);
    const selected = menuOptions.find((option) => option.value === value);
    const display = selected?.label ?? placeholder ?? "Select";

    useEffect(() => {
      if (!open) return undefined;
      setHighlightedIndex(selectedIndex);
      const closeOnOutside = (event: PointerEvent) => {
        const target = event.target as Node;
        if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
          setOpen(false);
        }
      };
      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setOpen(false);
          triggerRef.current?.focus();
        }
      };
      document.addEventListener("pointerdown", closeOnOutside);
      document.addEventListener("keydown", closeOnEscape);
      return () => {
        document.removeEventListener("pointerdown", closeOnOutside);
        document.removeEventListener("keydown", closeOnEscape);
      };
    }, [open, selectedIndex]);

    function choose(nextValue: string) {
      onChange(nextValue);
      setOpen(false);
      triggerRef.current?.focus();
    }

    function moveHighlight(delta: number) {
      setHighlightedIndex((current) => {
        const last = Math.max(0, menuOptions.length - 1);
        return Math.min(last, Math.max(0, current + delta));
      });
    }

    return (
      <>
        <button
          ref={(node) => {
            triggerRef.current = node;
            assignRef(forwardedRef, node);
          }}
          id={id}
          type="button"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          className={`${className} flex items-center justify-between gap-2 text-left`}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (!open) setOpen(true);
              else moveHighlight(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) setOpen(true);
              else moveHighlight(-1);
            } else if (event.key === "Home") {
              event.preventDefault();
              setHighlightedIndex(0);
            } else if (event.key === "End") {
              event.preventDefault();
              setHighlightedIndex(Math.max(0, menuOptions.length - 1));
            } else if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (!open) setOpen(true);
              else choose(menuOptions[highlightedIndex]?.value ?? value);
            }
          }}
        >
          <span className={`min-w-0 truncate ${!value && placeholder ? "text-[var(--color-ink-secondary)]" : ""}`}>{display}</span>
          <ChevronDown size={15} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <FloatingDropdown
          open={open}
          triggerRef={triggerRef}
          contentRef={menuRef}
          matchTriggerWidth
          role="listbox"
          id={listboxId}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-card)]"
        >
          {menuOptions.map((option, index) => (
            <button
              key={`${option.value}-${index}`}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`block w-full px-2.5 py-1.5 text-left text-sm ${
                index === highlightedIndex
                  ? "bg-[var(--color-primary-tint)] text-[var(--color-primary)]"
                  : "hover:bg-[var(--color-surface-muted)]"
              }`}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => choose(option.value)}
            >
              {option.label}
            </button>
          ))}
        </FloatingDropdown>
      </>
    );
  },
);

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else ref.current = value;
}

function formatOptionLabel(value: string) {
  return value.replace(/_/g, " ");
}
