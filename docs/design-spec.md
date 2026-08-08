# Dive Log — Claude Code Implementation Spec

Build a public, map-first dive logbook. Deploy: **dives.madhavkauntia.com** (Vercel,
static export). Sibling to Madhav FM — same quiet, dark, personal aesthetic.

This spec assumes the data layer already exists (see companion files):
- `scripts/import-ssi.ts` — the SSI importer (already written; do not modify its logic)
- `content/sites.json` — site id → {name, slug, lat, lng, region, country}
- `content/dives/NN-slug.json` — one file per dive

If those aren't present yet, run `npx tsx scripts/import-ssi.ts` with SSI_EMAIL /
SSI_PASSWORD in `.env.local` to generate them. Never commit `.env.local`.

---

## 1. Stack

- Next.js (App Router, TypeScript), `output: 'export'` — fully static, no server runtime.
- Tailwind CSS. No component library.
- **MapLibre GL JS** for the map (NOT Leaflet — the mockup used Leaflet for speed;
  production wants vector tiles). Free vector tiles from **Protomaps** (single static
  `.pmtiles` file served from your own assets, or their hosted demo endpoint) or
  **OpenFreeMap**. No Mapbox account, no billing, no API key that could leak in a
  static bundle.
- No analytics, no external fonts beyond one self-hosted display face.

## 2. Data layer (already defined — build against it)

Load all dives and sites at build time via a typed loader `lib/content.ts`:

```ts
export interface Site { id:number; name:string; slug:string;
  lat:number|null; lng:number|null; region:string; country:string; }
export interface Dive { number:number; date:string; time:string|null; site:number;
  maxDepthM:number|null; avgDepthM:number|null; durationMin:number|null;
  waterTempC:number|null; visibilityM:number|null; verified:boolean; notes:string; }
```

Derive, at build time, an aggregated per-site view used by the map:

```ts
export interface SiteAgg extends Site {
  dives: number;                 // count of dives at this site
  maxDepthM: number | null;      // Math.max over dives' maxDepthM  ← MAX, not avg
  avgDurationMin: number | null; // rounded mean of durationMin
  diveNumbers: number[];         // for linking to dive pages
}
```

And global stats:

```ts
export interface Stats {
  dives: number;                 // total dive count
  sites: number;                 // distinct sites with ≥1 dive
  countries: number;             // distinct site.country values
  deepestM: number;              // Math.max over all dives
  underwaterHours: number;       // round(sum(durationMin)/60)
  goal: 50;                      // progress target
}
```

Skip dives whose site id is missing from sites.json, but console.warn the id.

## 3. Pages

### `/` — the map (the whole product for v1)

Full-viewport MapLibre map, dark ocean style (dark water, low-contrast land, no
road/POI labels). Reproduce the **mockup** (`dive-log-mockup.html`) exactly in layout
and feel — it is the visual source of truth. Specifically:

- **Markers:** one circle per site, radius scales with dive count
  (`r = 6 + dives*2.4`), teal (`#5fd0c4`), low fill opacity (~0.16), with a soft
  larger halo beneath. On hover: raise fill opacity (~0.42) and stroke weight.
- **Hover card floats ABOVE the marker** (not a fixed corner panel). Card shows:
  site name, region (small-caps teal), then a 3-up row — **Dives here**,
  **Max depth** (site's deepest single dive, in m), **Avg time** (min). Dark frosted
  panel, thin border, small connector dot pointing down at the marker. Card fades
  in/out; only one shown at a time.
- **Stats panel, fixed top-right.** Title "Madhav's Dive Log" with generous margin
  below it (no tagline). Grid of: Dives, Sites, Countries, Deepest (m), Underwater (h).
  Then a progress row "Toward 50 · N / 50" with a thin teal fill bar
  (`width = dives/50`).
- **Bottom-left: empty.** No title, no hint, nothing. The map owns the frame.
- Initial view: `fitBounds` over all site coords with padding — the two clusters
  (Andaman + Malapascua) frame the Bay-of-Bengal-to-Philippine-Sea span.
- Zoom controls: minimal, dark, bottom or top-left, matching the panel styling.
- Marendered chrome must obey the aesthetic: type is small, letterspaced, muted;
  frosted dark panels (`backdrop-filter: blur`), 1px low-opacity borders, generous
  radius. Palette from the mockup (`--ink #e7eef2`, `--dim #8ea3ad`, `--teal #5fd0c4`,
  panel `rgba(10,18,22,.72)`).

**Clustering note:** the Andaman sites sit within ~1–2 km of each other, so at the
default zoom they overlap. Add MapLibre marker clustering (or a simple distance-based
merge) so overlapping sites collapse into one badge showing the combined count, and
expand as the user zooms in. This is required, not optional — without it the Andaman
cluster is an unreadable blob.

### `/dives/[number]` — one dive

Static param per dive file. Header: dive number, site name, region, date. A fact row
showing only the fields that are non-null for that dive: max depth, duration, water
temp, visibility. Then `notes` rendered from markdown (may be empty — omit the section
entirely if so, no empty state). Footer: ← previous / next → by dive number.

Clicking a site's hover card (or a marker) navigates to that site's dives — if one
dive, go straight to it; if several, either a small popover list of dives at that site
or the most recent. Keep it simple; the map is the hero, dive pages are secondary.

## 4. Explicitly cut from v1 (was in the architecture doc)

- **Depth-profile charts.** The SSI feed carries no depth time-series (`depthDataset`
  is always empty), so there is nothing to plot. Do not build the chart; do not add an
  empty-state for it. The `Dive.profile` field is gone.
- **Time-of-day / phases.** Not applicable to this project.
- Dive *planning* of any kind (no deco/NDL/gas math). This is a logbook, not a tool.
- Accounts, comments, other divers, photo galleries.

## 5. Atmosphere (build after the map works, not before)

Port the Madhav FM effects pattern lightly: a canvas layer above the map with slow,
sparse drifting particulate ("marine snow") at very low opacity, and a subtle
depth-gradient darkening on dive pages as you scroll. Respect
`prefers-reduced-motion`. Keep it subconscious — if it draws the eye, halve it.

## 6. Build phases

1. Content loaders + aggregation (`lib/content.ts`) with the `SiteAgg` / `Stats`
   derivations above. Verify against the real files: expect 19 dives, 12 sites,
   2 countries, deepest 28 m, ~14 h underwater.
2. Map page: MapLibre + dark style + markers + clustering + hover cards + stats panel,
   matching the mockup.
3. Dive pages + navigation between map and dives.
4. Marine-snow atmosphere + depth-gradient polish + mobile pass (panels reflow, map
   stays full-bleed, hover→tap works).

## 7. Guardrails

- Static export only; nothing may require a server at runtime.
- The importer and `.env.local` stay untouched; credentials never enter the bundle
  or the repo. `content/dives/*` and `sites.json` are the only data inputs.
- Match the mockup's look; don't introduce a new visual language.
- Acceptance for phase 2 is emotional as much as technical: the map, with the real
  dives on it, should feel good to just sit and look at.
