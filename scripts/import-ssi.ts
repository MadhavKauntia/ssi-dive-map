/**
 * SSI → dive-log importer.
 * Run manually after a trip:  npx tsx scripts/import-ssi.ts
 *
 * Auth + fetch use the private divessi app API. Credentials come ONLY from env:
 *   SSI_EMAIL, SSI_PASSWORD   (never commit these; keep in .env.local, gitignored)
 *
 * Writes:
 *   content/sites.json                         (merged, GPS from the feed)
 *   content/dives/<nr>-<site-slug>.json        (one per dive; never overwrites existing)
 *
 * Never writes: credentials, tokens, buddy PII, or the raw feed.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const APP = "0815_ADR";
// Since 2026-10-07 SSI rejects tokens from requests that don't identify as the
// official MySSI app: calls must carry the app `version` param AND the MySSI
// User-Agent, or every authenticated endpoint returns "token_not_valid".
const APP_VERSION = "ADR_4.1.268-ssi";
const USER_AGENT = "Dart/3.12 (dart:io)";
const HEADERS = { "User-Agent": USER_AGENT };
const BASE = "https://api.divessi.com/app/a21.php";
const SITES_PATH = "content/sites.json";
const DIVES_DIR = "content/dives";

// --- helpers ---------------------------------------------------------------
const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function num(v: unknown): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

// --- API -------------------------------------------------------------------
async function authenticate(email: string, password: string): Promise<string> {
  const url = `${BASE}?l=${encodeURIComponent(email)}&p=${encodeURIComponent(password)}&what=authenticate&ssiapp=${APP}&version=${encodeURIComponent(APP_VERSION)}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`auth HTTP ${res.status}`);
  const data: any = await res.json();
  if (data?.authenticated === false) {
    throw new Error(`auth rejected: ${data?.error_message || data?.authenticated_message || "login failed"}`);
  }
  // Be defensive: the token field name is undocumented. Try the obvious spots.
  const token = data?.token ?? data?.session ?? data?.data?.token;
  if (!token || typeof token !== "string") {
    throw new Error("auth: no token in response (shape changed — inspect and update)");
  }
  // SSI issues a token even when consent is pending, but that token is NOT
  // authorized for get_divelog — the feed comes back empty and the import looks
  // like a successful no-op. Fail loudly so the cause is visible, not silent.
  if (data?.privacy_settings_required === true || data?.marketing_required === true) {
    throw new Error(
      "SSI consent gate: your account has pending privacy/marketing settings, so the " +
        "issued token is not authorized for the logbook. Log in to MySSI " +
        "(app or my.divessi.com) and accept the updated privacy settings, then re-run."
    );
  }
  return token;
}

async function fetchDivelog(token: string): Promise<any> {
  const url = `${BASE}?what=get_divelog&token=${encodeURIComponent(token)}&ssiapp=${APP}&version=${encodeURIComponent(APP_VERSION)}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`divelog HTTP ${res.status}`);
  const data: any = await res.json();
  // The endpoint returns HTTP 200 with a JSON error body on an invalid/
  // unauthorized token (e.g. status:401, "token_not_valid"). Detect it instead
  // of treating a missing logbook as "zero dives".
  if (data && !Array.isArray(data) && (data.status >= 400 || data.authenticated === false)) {
    throw new Error(`divelog rejected: ${data?.result || data?.message || `status ${data?.status}`}`);
  }
  return data;
}

// --- mapping ---------------------------------------------------------------
interface Site {
  id: number; name: string; slug: string;
  lat: number | null; lng: number | null;
  region: string; country: string;
}

function mapSites(feed: any): Record<string, Site> {
  const out: Record<string, Site> = {};
  const list = Array.isArray(feed?.logbook_sites) ? feed.logbook_sites : [];
  for (const s of list) {
    const id = s?.odin_dive_sites_id;
    const name = s?.odin_dive_sites_name;
    if (id == null || !name) continue; // skip malformed
    out[String(id)] = {
      id,
      name,
      slug: slug(name),
      lat: num(s.odin_dive_sites_lat),
      lng: num(s.odin_dive_sites_lon),
      region: s?.odin_dive_sites_meta_region || s?.odin_dive_sites_meta_country || "",
      country: s?.odin_dive_sites_meta_country || "",
    };
  }
  return out;
}

interface Dive {
  number: number;
  date: string;
  time: string | null;
  site: number;            // site id → resolve against sites.json
  maxDepthM: number | null;
  avgDepthM: number | null;
  durationMin: number | null;
  waterTempC: number | null;
  visibilityM: number | null;
  verified: boolean;
  notes: string;           // author by hand later; importer never fills it
}

function mapDives(feed: any): Dive[] {
  const list = Array.isArray(feed?.logbook_details) ? feed.logbook_details : [];
  const dives: Dive[] = [];
  for (const d of list) {
    if (d?.odin_user_log_deleted) continue;        // respect soft-deletes
    const number = d?.odin_user_log_nr;
    const date = d?.odin_user_log_date;
    const site = d?.odin_user_log_dive_sites_id;
    if (number == null || !date || site == null) continue; // require the essentials
    dives.push({
      number,
      date,
      time: d?.odin_user_log_entry_time || null,
      site,
      maxDepthM: num(d.odin_user_log_depth_m),
      avgDepthM: num(d.odin_user_log_avg_depth_m),
      durationMin: num(d.odin_user_log_divetime),
      waterTempC: num(d.odin_user_log_watertemp_c),
      visibilityM: num(d.odin_user_log_vis_m),
      verified: d?.odin_user_log_verified === true,
      notes: "",
    });
  }
  return dives.sort((a, b) => a.number - b.number);
}

// --- write (never overwrite hand-edited dive files) ------------------------
function mergeSites(next: Record<string, Site>) {
  let existing: Record<string, Site> = {};
  if (existsSync(SITES_PATH)) existing = JSON.parse(readFileSync(SITES_PATH, "utf8"));
  // new GPS wins only where we previously had none; otherwise keep local edits
  for (const [id, s] of Object.entries(next)) {
    const prev = existing[id];
    existing[id] = prev
      ? { ...s, lat: prev.lat ?? s.lat, lng: prev.lng ?? s.lng, region: prev.region || s.region }
      : s;
  }
  writeFileSync(SITES_PATH, JSON.stringify(existing, null, 2) + "\n");
}

function writeDives(dives: Dive[], sites: Record<string, Site>) {
  if (!existsSync(DIVES_DIR)) mkdirSync(DIVES_DIR, { recursive: true });
  const present = new Set(readdirSync(DIVES_DIR));
  let written = 0, skipped = 0;
  const unknownSites = new Set<string>();
  for (const dive of dives) {
    const site = sites[String(dive.site)];
    if (!site) unknownSites.add(String(dive.site));
    const siteSlug = site?.slug ?? `site-${dive.site}`;
    const file = `${String(dive.number).padStart(2, "0")}-${siteSlug}.json`;
    if (present.has(file)) { skipped++; continue; }   // never clobber hand edits
    writeFileSync(join(DIVES_DIR, file), JSON.stringify(dive, null, 2) + "\n");
    written++;
  }
  return { written, skipped, unknownSites: [...unknownSites] };
}

// --- main ------------------------------------------------------------------
async function main() {
  const email = process.env.SSI_EMAIL, password = process.env.SSI_PASSWORD;
  if (!email || !password) {
    console.error("Set SSI_EMAIL and SSI_PASSWORD in the environment (e.g. .env.local). Aborting.");
    process.exit(1);
  }
  const token = await authenticate(email, password);
  const feed = await fetchDivelog(token);

  const sites = mapSites(feed);
  const dives = mapDives(feed);

  // Anomaly guard: an authorized, healthy feed always echoes back the full
  // logbook. If it yields zero dives while we already have dive files on disk,
  // something upstream is wrong (expired/unauthorized token, API change) — do
  // NOT proceed as a silent no-op. Bail so the job goes red.
  const haveOnDisk = existsSync(DIVES_DIR) &&
    readdirSync(DIVES_DIR).some((f) => f.endsWith(".json"));
  if (dives.length === 0 && haveOnDisk) {
    throw new Error(
      "feed returned 0 dives but local dives exist — refusing to treat as a no-op. " +
        "Likely an unauthorized token or an SSI API change; inspect the get_divelog response."
    );
  }

  mergeSites(sites);
  const res = writeDives(dives, sites);

  console.log(`sites: ${Object.keys(sites).length} | dives written: ${res.written}, skipped(existing): ${res.skipped}`);
  if (res.unknownSites.length)
    console.warn(`⚠ dives referenced site ids not in logbook_sites: ${res.unknownSites.join(", ")} — add them to ${SITES_PATH} by hand.`);
  // Deliberately NOT touching logbook_buddies (contains PII) or logbook_stats (recomputed at build time).
}

main().catch((e) => { console.error("import failed:", e.message); process.exit(1); });
