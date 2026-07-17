import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  ChevronDown,
  HeartPulse,
  MapPin,
  Menu,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";
import { useAllOrderRecords, useAllResultRecords, useRecentAppNotifications, type AppNotification } from "../db/hooks";
import { FloatingDropdown } from "./FloatingDropdown";
import { criticalResultRequiresAcknowledgement, isOrderOverdue, isOrderTerminal, resultRequiresAttention } from "../lib/clinicalWorkflow";
import { useNow } from "../lib/useNow";
import { useAppStore } from "../store/useAppStore";
import { DEMO_STAFF, demoStaffById, defaultPathForDemoRole } from "../domain/prototypeUser";

interface NavigationItem {
  to: string;
  label: string;
  end?: boolean;
  count?: number;
  urgent?: boolean;
}

const NORMAL_PRIMARY_TABS: NavigationItem[] = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/queue", label: "Queue" },
  { to: "/beds", label: "Beds" },
  { to: "/patients", label: "Patients" },
  { to: "/orders", label: "Orders" },
  { to: "/results", label: "Results" },
  { to: "/disposition", label: "Disposition" },
];

const NORMAL_MORE_GROUPS = [
  {
    label: "Flow",
    items: [{ to: "/vitals-due", label: "Vitals due" }, { to: "/admissions", label: "Admissions" }, { to: "/boarding", label: "Boarding" }],
  },
  {
    label: "Operations",
    items: [
      { to: "/incident", label: "Incident command" },
      { to: "/reconcile", label: "Reconciliation" },
      { to: "/reports", label: "Reports" },
      { to: "/prototype-settings", label: "Prototype settings" },
    ],
  },
];

const CRISIS_TABS: NavigationItem[] = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/incident", label: "Incident" },
  { to: "/reconcile", label: "Reconcile" },
];
const NOTIFICATION_READ_STORAGE_KEY = "er-system.notifications.read-at";

export function WebNav() {
  const mode = useAppStore((s) => s.mode);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const actingStaffId = useAppStore((s) => s.actingStaffId);
  const setActingStaff = useAppStore((s) => s.setActingStaff);
  const orders = useAllOrderRecords();
  const results = useAllResultRecords();
  const navigate = useNavigate();
  const location = useLocation();
  const now = useNow();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const actingStaff = demoStaffById(actingStaffId);

  const activeOrders = orders.filter((order) => !isOrderTerminal(order.status));
  const overdueOrders = activeOrders.filter((order) => isOrderOverdue(order, now));
  const unreviewedResults = results.filter(resultRequiresAttention);
  const criticalResults = results.filter(criticalResultRequiresAcknowledgement);

  const primaryTabs = useMemo<NavigationItem[]>(() => {
    if (mode === "catastrophe") return CRISIS_TABS;
    return NORMAL_PRIMARY_TABS.map((item) => {
      if (item.to === "/orders") {
        return { ...item, count: activeOrders.length, urgent: overdueOrders.length > 0 };
      }
      if (item.to === "/results") {
        return { ...item, count: unreviewedResults.length, urgent: criticalResults.length > 0 };
      }
      return item;
    });
  }, [activeOrders.length, criticalResults.length, mode, overdueOrders.length, unreviewedResults.length]);

  const moreMenuActive = NORMAL_MORE_GROUPS.some((group) =>
    group.items.some((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)),
  );

  useEffect(() => {
    setMobileMenuOpen(false);
    setMoreMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen && !moreMenuOpen) return undefined;
    const closeMenus = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
        setMoreMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", closeMenus);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenus);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileMenuOpen, moreMenuOpen]);

  const changeActingStaff = (staffId: string) => {
    const selected = demoStaffById(staffId);
    setActingStaff(selected.id);
    navigate(defaultPathForDemoRole(selected.role));
  };

  return (
    <header className="sticky top-0 z-50 border-b border-white/15 bg-[var(--color-primary-dark)] text-white shadow-sm">
      <div className="prototype-disclaimer-bar">
        <strong>Training prototype — not validated for clinical use.</strong>
        <label className="prototype-role-selector hidden sm:flex">
          <span>Acting as</span>
          <select value={actingStaffId} onChange={(event) => changeActingStaff(event.target.value)}>
            {DEMO_STAFF.map((staff) => (
              <option key={staff.id} value={staff.id}>{staff.name} — {staff.roleLabel}</option>
            ))}
          </select>
        </label>
      </div>
      <div ref={navRef} className="relative flex h-14 min-w-0 items-center gap-1 px-2 sm:px-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex h-11 shrink-0 items-center gap-2 rounded-md px-1 text-left hover:bg-white/10"
          aria-label="ER Command dashboard"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-[var(--color-primary-dark)]">
            <HeartPulse size={19} />
          </span>
          <span className="hidden text-base font-bold min-[620px]:inline">ER Command</span>
        </button>

        <div className="hidden h-7 w-px bg-white/25 min-[1280px]:block" />
        <div className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-white/90 min-[1440px]:flex">
          <MapPin size={16} />
          Emergency Department
        </div>

        <span className="hidden shrink-0 rounded bg-white/15 px-2 py-1 text-xs font-semibold min-[1180px]:inline-flex">
          {mode === "catastrophe" ? "Catastrophe active" : "Normal mode"}
        </span>

        <nav aria-label="Primary navigation" className="ml-1 hidden min-w-0 flex-1 items-center gap-0.5 min-[960px]:flex">
          {primaryTabs.map((item) => (
            <PrimaryNavLink key={item.to} item={item} />
          ))}

          {mode === "normal" && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setMoreMenuOpen((open) => !open)}
                className={`flex h-10 items-center gap-1 border-b-2 px-2 text-sm font-medium transition ${
                  moreMenuActive || moreMenuOpen
                    ? "border-white bg-white/10 text-white"
                    : "border-transparent text-white/75 hover:bg-white/10 hover:text-white"
                }`}
                aria-expanded={moreMenuOpen}
                aria-controls="desktop-more-menu"
              >
                More
                <ChevronDown size={14} className={moreMenuOpen ? "rotate-180" : ""} />
              </button>

              {moreMenuOpen && (
                <div
                  id="desktop-more-menu"
                  className="absolute left-0 top-[calc(100%+7px)] w-56 border border-[var(--color-border)] bg-[var(--color-surface)] py-2 text-[var(--color-ink)] shadow-xl"
                >
                  {NORMAL_MORE_GROUPS.map((group) => (
                    <div key={group.label} className="pb-1 last:pb-0">
                      <p className="px-3 py-1 text-[10px] font-bold uppercase text-[var(--color-ink-secondary)]">
                        {group.label}
                      </p>
                      {group.items.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          className={({ isActive }) =>
                            `flex min-h-10 items-center border-l-2 px-3 text-sm font-medium ${
                              isActive
                                ? "border-[var(--color-primary)] bg-[var(--color-primary-tint)] text-[var(--color-primary)]"
                                : "border-transparent text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
                            }`
                          }
                        >
                          {item.label}
                        </NavLink>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <div className="mr-1 hidden text-right text-xs text-white/80 min-[1680px]:block">
            <div className="font-semibold text-white">{actingStaff.name}</div>
            <div>{new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} shift</div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/patients")}
            className="inline-flex h-11 w-10 items-center justify-center rounded-md text-white/90 hover:bg-white/10 hover:text-white"
            aria-label="Search patients"
            title="Search patients"
          >
            <Search size={19} />
          </button>
          <NotificationsBell />
          <button
            type="button"
            onClick={() => navigate("/incident")}
            className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-semibold ${
              mode === "catastrophe"
                ? "bg-[var(--color-catastrophe-bg)] text-white"
                : "border border-white/35 text-white hover:bg-white/10"
            }`}
            aria-label={mode === "catastrophe" ? "Manage catastrophe mode" : "Open catastrophe mode"}
            title={mode === "catastrophe" ? "Manage catastrophe" : "Catastrophe mode"}
          >
            <AlertTriangle size={16} />
            <span className="hidden min-[1380px]:inline">
              {mode === "catastrophe" ? "Manage catastrophe" : "Catastrophe mode"}
            </span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-11 w-10 items-center justify-center rounded-md text-white/90 hover:bg-white/10 hover:text-white"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="inline-flex h-11 w-10 items-center justify-center rounded-md text-white/90 hover:bg-white/10 hover:text-white min-[960px]:hidden"
            aria-label={mobileMenuOpen ? "Close application menu" : "Open application menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-application-menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <nav
            id="mobile-application-menu"
            aria-label="Mobile primary navigation"
            className="absolute left-0 right-0 top-full max-h-[calc(100vh-var(--app-header-height))] overflow-y-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[var(--color-ink)] shadow-lg min-[960px]:hidden"
          >
            <label className="mb-3 flex flex-col gap-1 sm:hidden">
              <span className="text-xs font-semibold text-[var(--color-ink-secondary)]">Acting as</span>
              <select
                className="h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] px-2 text-sm"
                value={actingStaffId}
                onChange={(event) => changeActingStaff(event.target.value)}
              >
                {DEMO_STAFF.map((staff) => (
                  <option key={staff.id} value={staff.id}>{staff.name} — {staff.roleLabel}</option>
                ))}
              </select>
              <span className="text-xs text-[var(--color-ink-secondary)]">Prototype role simulation — no authentication is enabled.</span>
            </label>
            <div className="grid grid-cols-2 gap-1">
              {primaryTabs.map((item) => (
                <PrimaryNavLink key={item.to} item={item} mobile />
              ))}
            </div>

            {mode === "normal" &&
              NORMAL_MORE_GROUPS.map((group) => (
                <div key={group.label} className="mt-3 border-t border-[var(--color-border)] pt-2">
                  <p className="px-2 py-1 text-[10px] font-bold uppercase text-[var(--color-ink-secondary)]">
                    {group.label}
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {group.items.map((item) => (
                      <PrimaryNavLink key={item.to} item={item} mobile />
                    ))}
                  </div>
                </div>
              ))}
          </nav>
        )}
      </div>
    </header>
  );
}

function NotificationsBell() {
  const notifications = useRecentAppNotifications(50);
  const [open, setOpen] = useState(false);
  const [readAt, setReadAt] = useState(() => loadNotificationReadAt());
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const unreadCount = notifications.filter((notification) => notification.createdAt > readAt).length;

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
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
  }, [open]);

  function markRead(timestamp = Date.now()) {
    setReadAt(timestamp);
    window.localStorage.setItem(NOTIFICATION_READ_STORAGE_KEY, String(timestamp));
  }

  function toggleOpen() {
    setOpen((current) => {
      const next = !current;
      if (next) markRead();
      return next;
    });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        className="relative inline-flex h-11 w-10 items-center justify-center rounded-md text-white/90 hover:bg-white/10 hover:text-white"
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--color-red-solid)] px-1 text-[10px] font-bold leading-4 text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      <FloatingDropdown
        open={open}
        triggerRef={triggerRef}
        contentRef={menuRef}
        align="end"
        minWidth={360}
        maxWidth={420}
        role="dialog"
        ariaLabel="Notifications"
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-xl"
      >
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--color-border)] px-3">
          <div>
            <h2 className="text-sm font-semibold">Notifications</h2>
            <p className="text-xs text-[var(--color-ink-secondary)]">{notifications.length ? "Recent clinical events" : "No recent events"}</p>
          </div>
          <button
            type="button"
            onClick={() => markRead()}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-tint)]"
          >
            <CheckCheck size={14} /> Mark read
          </button>
        </div>
        <div className="max-h-[min(520px,calc(100vh-120px))] overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-3 py-4 text-sm text-[var(--color-ink-secondary)]">Main clinical events will appear here when they are added.</p>
          ) : (
            notifications.map((notification) => (
              <NotificationRow key={notification.id} notification={notification} unread={notification.createdAt > readAt} onSelect={() => setOpen(false)} />
            ))
          )}
        </div>
      </FloatingDropdown>
    </>
  );
}

function NotificationRow({ notification, unread, onSelect }: { notification: AppNotification; unread: boolean; onSelect: () => void }) {
  return (
    <Link
      to={notification.href}
      onClick={onSelect}
      className={`grid grid-cols-[10px_minmax(0,1fr)] gap-2 border-b border-[var(--color-border)] px-3 py-2.5 text-left last:border-0 hover:bg-[var(--color-surface-muted)] ${unread ? "bg-[var(--color-primary-tint)]" : ""}`}
    >
      <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${notificationDotClass(notification.severity)}`} aria-hidden="true" />
      <span className="min-w-0">
        <span className="flex items-start justify-between gap-2">
          <strong className="min-w-0 break-words text-sm leading-snug">{notification.title}</strong>
          <time className="shrink-0 text-[11px] font-semibold text-[var(--color-ink-secondary)]">{formatNotificationTime(notification.createdAt)}</time>
        </span>
        <span className="mt-0.5 block break-words text-xs text-[var(--color-ink-secondary)]">{notification.message}</span>
        <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] font-semibold text-[var(--color-ink-secondary)]">
          <span>{notification.patientLabel}</span>
          {notification.actor && <span>By {notification.actor}</span>}
        </span>
      </span>
    </Link>
  );
}

function notificationDotClass(severity: string) {
  if (severity === "critical") return "bg-[var(--color-red-solid)]";
  if (severity === "warning") return "bg-[var(--color-yellow-solid)]";
  return "bg-[var(--color-primary)]";
}

function formatNotificationTime(value: number) {
  const deltaMs = Date.now() - value;
  const minute = 60 * 1000;
  if (deltaMs < minute) return "now";
  if (deltaMs < 60 * minute) return `${Math.floor(deltaMs / minute)}m`;
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function loadNotificationReadAt() {
  if (typeof window === "undefined") return 0;
  const value = Number(window.localStorage.getItem(NOTIFICATION_READ_STORAGE_KEY));
  return Number.isFinite(value) ? value : 0;
}

function PrimaryNavLink({ item, mobile = false }: { item: NavigationItem; mobile?: boolean }) {
  const location = useLocation();
  const active = isNavigationItemActive(item, location.pathname);
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={(() => {
        if (mobile) {
          return `flex min-h-11 min-w-0 items-center gap-1.5 rounded-md px-3 text-sm font-semibold ${
            active
              ? "bg-[var(--color-primary)] text-white"
              : "text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
          }`;
        }
        return `flex h-10 shrink-0 items-center gap-1 border-b-2 px-2 text-sm font-medium transition ${
          active
            ? "border-white bg-white/10 text-white"
            : "border-transparent text-white/75 hover:bg-white/10 hover:text-white"
        }`;
      })()}
    >
      <span className="truncate">{item.label}</span>
      {typeof item.count === "number" && item.count > 0 && (
        <span
          className={`inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
            item.urgent
              ? "bg-[var(--color-red-solid)] text-white"
              : mobile
                ? "bg-[var(--color-surface-muted)] text-[var(--color-ink)]"
                : "bg-white/20 text-white"
          }`}
          aria-label={`${item.count} ${item.label.toLowerCase()} require attention`}
        >
          {item.count > 99 ? "99+" : item.count}
        </span>
      )}
    </Link>
  );
}

function isNavigationItemActive(item: NavigationItem, pathname: string) {
  if (item.to === "/") return pathname === "/";
  if (item.to === "/orders") return pathname === "/orders" || /^\/patients\/[^/]+\/orders\/?$/.test(pathname);
  if (item.to === "/results") return pathname === "/results" || /^\/patients\/[^/]+\/results\/?$/.test(pathname);
  if (item.to === "/patients") {
    return pathname.startsWith("/patients") && !/\/patients\/[^/]+\/(orders|results)\/?$/.test(pathname);
  }
  return pathname === item.to || (!item.end && pathname.startsWith(`${item.to}/`));
}
