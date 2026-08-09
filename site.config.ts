/**
 * Fork-friendly settings. Change these to make the log your own — everything
 * user-facing (page title, stats heading, the progress goal, the map theme)
 * reads from here.
 */
export const siteConfig = {
  /** Shown as "<owner>'s Dive Map" in the title and stats panel. */
  owner: "Madhav",
  /** The dive count you're working toward — drives the progress bar. */
  diveGoal: 50,
  /** Source repo, linked from the corner watermark. Point forks at your own. */
  repo: "https://github.com/MadhavKauntia/ssi-dive-map",
};

/** "Madhav's Dive Map" — handles a trailing "s" gracefully. */
export const logTitle = `${siteConfig.owner}${
  siteConfig.owner.endsWith("s") ? "'" : "'s"
} Dive Map`;

/** "MadhavKauntia/ssi-dive-map" — the repo shown on the watermark. */
export const repoLabel = siteConfig.repo.replace(/^https?:\/\/github\.com\//, "");

/**
 * Map appearance. Change any of this without touching component code.
 */
export const mapTheme = {
  /**
   * Basemap. A named OpenFreeMap style — "dark" | "positron" | "liberty" |
   * "bright" — or a full MapLibre style URL of your own.
   */
  basemap: "dark" as "dark" | "positron" | "liberty" | "bright" | (string & {}),

  /** Marker, halo, and cluster color. */
  accent: "#5fd0c4",

  /**
   * Recolor the basemap to match your palette once it loads. Set to `null` to
   * keep the basemap's own colors (e.g. when using a light style like positron).
   */
  recolor: {
    background: "#05090c",
    water: "#0a1319",
  } as { background: string; water: string } | null,

  /** Strip the basemap's road/place labels for a quieter map. */
  hideLabels: true,
};

const OPENFREEMAP = new Set(["dark", "positron", "liberty", "bright"]);

/** Resolves the configured basemap to a MapLibre style URL. */
export const basemapUrl = OPENFREEMAP.has(mapTheme.basemap)
  ? `https://tiles.openfreemap.org/styles/${mapTheme.basemap}`
  : mapTheme.basemap;
