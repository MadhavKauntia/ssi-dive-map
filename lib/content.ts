import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { siteConfig } from "@/site.config";

// ---------------------------------------------------------------------------
// Types (data contract — mirrors the importer's output; do not drift)
// ---------------------------------------------------------------------------
export interface Site {
  id: number;
  name: string;
  slug: string;
  lat: number | null;
  lng: number | null;
  region: string;
  country: string;
}

export interface Dive {
  number: number;
  date: string;
  time: string | null;
  site: number;
  maxDepthM: number | null;
  avgDepthM: number | null;
  durationMin: number | null;
  waterTempC: number | null;
  visibilityM: number | null;
  verified: boolean;
  notes: string;
}

// Per-site aggregate used by the map.
export interface SiteAgg extends Site {
  dives: number; // count of dives at this site
  maxDepthM: number | null; // MAX over dives' maxDepthM — deepest single dive
  avgDurationMin: number | null; // rounded mean of durationMin
  diveNumbers: number[]; // ascending, for linking to dive pages
  place: string; // display label (small-caps teal), mockup-style
}

export interface Stats {
  dives: number;
  sites: number;
  countries: number;
  deepestM: number;
  underwaterHours: number;
  goal: number; // progress target, from site.config
}

// ---------------------------------------------------------------------------
// Raw loaders (build-time only — Node fs)
// ---------------------------------------------------------------------------
const CONTENT = join(process.cwd(), "content");

export function getSites(): Record<string, Site> {
  return JSON.parse(readFileSync(join(CONTENT, "sites.json"), "utf8"));
}

export function getDives(): Dive[] {
  const dir = join(CONTENT, "dives");
  const dives = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Dive)
    .sort((a, b) => a.number - b.number);

  // Skip dives whose site is missing from sites.json (but warn — §2).
  const sites = getSites();
  return dives.filter((d) => {
    if (!sites[String(d.site)]) {
      console.warn(
        `[content] dive #${d.number} references unknown site id ${d.site} — skipping`
      );
      return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Display place label — mockup-style ("Havelock · Andaman"). This is a
// presentation derivation, NOT part of the data contract: curated overrides for
// the sites in the mockup, graceful region/country fallback for anything new.
// ---------------------------------------------------------------------------
const PLACE_OVERRIDES: Record<number, string> = {
  75161: "Havelock · Andaman", // The Wall
  75162: "Peel Island · Andaman", // Red Pillar
  75163: "Havelock · Andaman", // Lighthouse
  75171: "Havelock · Andaman", // Nemo Reef
  228300: "Andaman", // I-95
  247984: "Havelock · Andaman", // Slope
  247985: "Havelock · Andaman", // Tribe Gate
  275155: "Pondicherry", // Temple Reef
  118730: "Malapascua · Cebu", // Lapus-Lapus
  209386: "Malapascua · Cebu", // Monad Shoal
  239677: "Malapascua · Cebu", // Gato Island
  241798: "Malapascua · Cebu", // Kimud Shoal
};

export function displayPlace(site: Site): string {
  if (PLACE_OVERRIDES[site.id]) return PLACE_OVERRIDES[site.id];
  const region = site.region === "Andaman and Nicobar Islands" ? "Andaman" : site.region;
  return region || site.country || "";
}

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------
function mean(nums: number[]): number | null {
  const xs = nums.filter((n) => Number.isFinite(n));
  if (!xs.length) return null;
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

export function getSiteAggs(): SiteAgg[] {
  const sites = getSites();
  const dives = getDives();

  const bySite = new Map<number, Dive[]>();
  for (const d of dives) {
    const arr = bySite.get(d.site) ?? [];
    arr.push(d);
    bySite.set(d.site, arr);
  }

  const aggs: SiteAgg[] = [];
  for (const [siteId, group] of bySite) {
    const site = sites[String(siteId)];
    const depths = group
      .map((d) => d.maxDepthM)
      .filter((n): n is number => n != null);
    const durations = group
      .map((d) => d.durationMin)
      .filter((n): n is number => n != null);

    aggs.push({
      ...site,
      dives: group.length,
      maxDepthM: depths.length ? Math.max(...depths) : null,
      avgDurationMin: mean(durations),
      diveNumbers: group.map((d) => d.number).sort((a, b) => a - b),
      place: displayPlace(site),
    });
  }

  // stable order by dive number of first dive — deterministic build output
  return aggs.sort((a, b) => a.diveNumbers[0] - b.diveNumbers[0]);
}

export function getStats(): Stats {
  const dives = getDives();
  const sites = getSites();

  const usedSites = new Set(dives.map((d) => d.site));
  const countries = new Set(
    [...usedSites]
      .map((id) => sites[String(id)]?.country)
      .filter((c): c is string => Boolean(c))
  );
  const depths = dives
    .map((d) => d.maxDepthM)
    .filter((n): n is number => n != null);
  const totalMin = dives.reduce((a, d) => a + (d.durationMin ?? 0), 0);

  return {
    dives: dives.length,
    sites: usedSites.size,
    countries: countries.size,
    deepestM: depths.length ? Math.round(Math.max(...depths)) : 0,
    underwaterHours: Math.round(totalMin / 60),
    goal: siteConfig.diveGoal,
  };
}

// Single dive + its site, for the dive page. Returns null if not found.
export function getDive(number: number): { dive: Dive; site: Site } | null {
  const dive = getDives().find((d) => d.number === number);
  if (!dive) return null;
  return { dive, site: getSites()[String(dive.site)] };
}
