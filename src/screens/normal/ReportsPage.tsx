const WAIT_TREND = [22, 28, 35, 41, 38, 30, 25, 20];
const DISPOSITIONS = [
  { label: "Discharged", value: 62, color: "var(--color-green-solid)" },
  { label: "Admitted", value: 24, color: "var(--color-yellow-solid)" },
  { label: "Transferred", value: 8, color: "var(--color-teal-solid)" },
  { label: "LWBS", value: 6, color: "var(--color-red-solid)" },
];
const ARRIVALS_BY_HOUR = [3, 2, 1, 1, 2, 4, 7, 10, 12, 9, 8, 11, 13, 10, 9, 8, 10, 12, 11, 9, 7, 6, 5, 4];

export function ReportsPage() {
  const maxWait = Math.max(...WAIT_TREND);
  const maxArrivals = Math.max(...ARRIVALS_BY_HOUR);

  return (
    <div className="mx-auto max-w-[1440px] space-y-3 p-3">
      <div>
        <h1 className="text-lg font-semibold">Reports</h1>
        <p className="text-sm text-[var(--color-ink-secondary)]">
          Example reporting views with static demo data.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold">Wait time trend (last 8 hours, min)</h2>
          <div className="flex h-32 items-end gap-1.5">
            {WAIT_TREND.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${(v / maxWait) * 100}%`,
                    background: "var(--color-primary)",
                  }}
                />
                <span className="text-xs text-[var(--color-ink-secondary)]">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 text-sm font-semibold">Dispositions breakdown</h2>
          <div className="space-y-2">
            {DISPOSITIONS.map((d) => (
              <div key={d.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{d.label}</span>
                  <span className="text-[var(--color-ink-secondary)]">{d.value}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                  <div className="h-full rounded-full" style={{ width: `${d.value}%`, background: d.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card col-span-2 max-[900px]:col-span-1">
          <h2 className="mb-3 text-sm font-semibold">Arrivals per hour</h2>
          <div className="flex h-28 items-end gap-1">
            {ARRIVALS_BY_HOUR.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${(v / maxArrivals) * 100}%`,
                    background: "var(--color-green-solid)",
                  }}
                />
                <span className="text-[9px] text-[var(--color-ink-secondary)]">{i}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
