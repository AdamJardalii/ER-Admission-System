import { useAppStore } from "../store/useAppStore";

export function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  const dismissToast = useAppStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[min(90vw,420px)]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center justify-between gap-3 rounded-lg px-4 py-3 shadow-lg"
          style={{ background: "var(--color-toast-bg)", color: "var(--color-toast-text)" }}
        >
          <span className="text-sm">{t.message}</span>
          {t.undo && (
            <button
              className="text-sm font-medium underline shrink-0"
              onClick={() => {
                t.undo?.();
                dismissToast(t.id);
              }}
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
