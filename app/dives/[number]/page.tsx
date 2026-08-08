import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getDive, getDives, displayPlace } from "@/lib/content";
import DepthGradient from "@/components/DepthGradient";

// One static route per dive file.
export function generateStaticParams() {
  return getDives().map((d) => ({ number: String(d.number) }));
}

function formatDate(iso: string): string {
  // "2025-11-25" → "25 November 2025", locale-independent (no runtime TZ drift)
  const [y, m, d] = iso.split("-").map(Number);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  if (!y || !m || !d) return iso;
  return `${d} ${months[m - 1]} ${y}`;
}

type Fact = { label: string; value: number; unit: string };

export default async function DivePage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const n = Number(number);
  const found = getDive(n);
  if (!found) notFound();
  const { dive, site } = found;

  // prev / next by dive number across the whole log
  const all = getDives();
  const idx = all.findIndex((d) => d.number === n);
  const prev = idx > 0 ? all[idx - 1] : null;
  const next = idx < all.length - 1 ? all[idx + 1] : null;

  // only the facts that exist for this dive (§3)
  const facts: Fact[] = [
    { label: "Max depth", value: dive.maxDepthM!, unit: "m" },
    { label: "Duration", value: dive.durationMin!, unit: "min" },
    { label: "Water temp", value: dive.waterTempC!, unit: "°C" },
    { label: "Visibility", value: dive.visibilityM!, unit: "m" },
  ].filter((f) => f.value != null);

  const hasNotes = dive.notes.trim().length > 0;

  return (
    <>
      <DepthGradient />
      <main className="relative z-10 mx-auto min-h-screen w-full max-w-[640px] px-6 py-16 sm:py-24">
        {/* back to the map */}
        <Link
          href="/"
          className="text-[10px] uppercase tracking-[0.18em] text-faint transition-colors hover:text-dim"
        >
          ← The map
        </Link>

        {/* header */}
        <header className="mt-10">
          <div className="text-[11px] uppercase tracking-[0.22em] text-teal">
            Dive {dive.number}
          </div>
          <h1 className="mt-3 text-[32px] font-light leading-tight tracking-[0.01em] text-ink sm:text-[38px]">
            {site.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] tracking-[0.06em] text-dim">
            <span className="uppercase tracking-[0.14em] text-faint">
              {displayPlace(site)}
            </span>
            <span className="text-faint">·</span>
            <span>{formatDate(dive.date)}</span>
            {dive.verified && (
              <>
                <span className="text-faint">·</span>
                <span className="text-teal-soft">verified</span>
              </>
            )}
          </div>
        </header>

        {/* fact row — only what's recorded */}
        {facts.length > 0 && (
          <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-[var(--line)] pt-10 sm:grid-cols-4">
            {facts.map((f) => (
              <div key={f.label}>
                <dd className="text-[28px] font-light leading-none text-ink">
                  {f.value}
                  <span className="ml-0.5 text-[13px] text-dim">{f.unit}</span>
                </dd>
                <dt className="mt-[6px] text-[9.5px] uppercase tracking-[0.16em] text-faint">
                  {f.label}
                </dt>
              </div>
            ))}
          </dl>
        )}

        {/* notes — omitted entirely when empty (no empty state) */}
        {hasNotes && (
          <div className="dive-notes mt-14 border-t border-[var(--line)] pt-10 text-[15px] leading-[1.75] text-dim">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {dive.notes}
            </ReactMarkdown>
          </div>
        )}

        {/* prev / next */}
        <footer className="mt-20 flex items-center justify-between border-t border-[var(--line)] pt-8 text-[12px] tracking-[0.06em]">
          {prev ? (
            <Link
              href={`/dives/${prev.number}`}
              className="group text-dim transition-colors hover:text-ink"
            >
              <span className="text-faint transition-colors group-hover:text-dim">
                ← Dive {prev.number}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/dives/${next.number}`}
              className="group text-right text-dim transition-colors hover:text-ink"
            >
              <span className="text-faint transition-colors group-hover:text-dim">
                Dive {next.number} →
              </span>
            </Link>
          ) : (
            <span />
          )}
        </footer>
      </main>
    </>
  );
}
