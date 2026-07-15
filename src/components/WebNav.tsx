import { NavLink, useNavigate } from "react-router-dom";
import { AlertTriangle, HeartPulse, Moon, Sun } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

const NORMAL_TABS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/queue", label: "Queue" },
  { to: "/beds", label: "Beds" },
  { to: "/patients", label: "Patients" },
  { to: "/vitals-due", label: "Vitals due" },
  { to: "/incident", label: "Incident" },
  { to: "/reconcile", label: "Reconcile" },
  { to: "/reports", label: "Reports" },
];

const CRISIS_TABS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/incident", label: "Incident" },
  { to: "/reconcile", label: "Reconcile" },
];

export function WebNav() {
  const mode = useAppStore((s) => s.mode);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const tabs = mode === "catastrophe" ? CRISIS_TABS : NORMAL_TABS;
  const navigate = useNavigate();

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className="flex items-center gap-2 text-base font-bold text-[var(--color-ink)]">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-primary)] text-white">
            <HeartPulse size={17} />
          </span>
          ER Command
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold"
          style={
            mode === "catastrophe"
              ? { background: "var(--color-catastrophe-bg)", color: "var(--color-catastrophe-text)" }
              : { background: "var(--color-green-tint)", color: "var(--color-green-text)" }
          }
        >
          {mode === "catastrophe" ? "Catastrophe mode active" : "Normal mode"}
        </span>
        <div className="ml-auto flex items-center gap-2 text-sm text-[var(--color-ink-secondary)]">
          <span className="max-[840px]:hidden">Demo Provider</span>
          <span className="max-[840px]:hidden">|</span>
          <span className="max-[680px]:hidden">{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} shift</span>
          <button
            type="button"
            onClick={() => navigate("/incident")}
            className="ml-1 inline-flex items-center gap-1.5 rounded-md border border-[var(--color-catastrophe-bg)] px-2.5 py-1.5 text-sm font-semibold text-[var(--color-catastrophe-bg)]"
          >
            <AlertTriangle size={14} />
            {mode === "catastrophe" ? "Manage catastrophe" : "Catastrophe mode"}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-ink-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)]"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-4">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                isActive
                  ? "border-[var(--color-primary)] font-semibold text-[var(--color-primary)]"
                  : "border-transparent text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)]"
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
