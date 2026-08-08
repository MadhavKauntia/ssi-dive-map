import type { Stats } from "@/lib/content";
import { logTitle } from "@/site.config";

function Stat({ n, unit, label }: { n: number; unit?: string; label: string }) {
  return (
    <div className="stat">
      <div className="text-[26px] font-light leading-none tracking-[0.01em] text-ink">
        {n}
        {unit && <small className="ml-0.5 text-[13px] text-dim">{unit}</small>}
      </div>
      <div className="mt-[5px] text-[9.5px] uppercase tracking-[0.16em] text-faint">
        {label}
      </div>
    </div>
  );
}

export default function StatsPanel({ stats }: { stats: Stats }) {
  const pct = Math.min(100, Math.round((stats.dives / stats.goal) * 100));

  return (
    <div className="stats-panel panel fixed right-5 top-5 z-[500] w-[238px] px-5 pb-5 pt-[18px]">
      {/* generous margin below the title, no tagline — §3 */}
      <h1 className="mb-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-dim">
        {logTitle}
      </h1>

      <div className="grid grid-cols-2 gap-x-4 gap-y-[14px]">
        <Stat n={stats.dives} label="Dives" />
        <Stat n={stats.sites} label="Sites" />
        <Stat n={stats.countries} label="Countries" />
        <Stat n={stats.deepestM} unit="m" label="Deepest" />
        <Stat n={stats.underwaterHours} unit="h" label="Underwater" />
      </div>

      <div className="mt-[18px]">
        <div className="mb-[7px] flex items-baseline justify-between">
          <span className="text-[9.5px] uppercase tracking-[0.16em] text-faint">
            Toward {stats.goal}
          </span>
          <span className="text-[11px] tracking-[0.08em] text-dim">
            {stats.dives} / {stats.goal}
          </span>
        </div>
        <div className="h-[3px] overflow-hidden rounded-[2px] bg-[rgba(120,150,160,0.15)]">
          <span
            className="block h-full rounded-[2px]"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg,var(--teal-soft),var(--teal))",
            }}
          />
        </div>
      </div>
    </div>
  );
}
