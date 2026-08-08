/**
 * Fork-friendly settings. Change these to make the log your own — everything
 * user-facing (page title, stats heading, the progress goal) reads from here.
 */
export const siteConfig = {
  /** Shown as "<owner>'s Dive Map" in the title and stats panel. */
  owner: "Madhav",
  /** The dive count you're working toward — drives the progress bar. */
  diveGoal: 50,
};

/** "Madhav's Dive Map" — handles a trailing "s" gracefully. */
export const logTitle = `${siteConfig.owner}${
  siteConfig.owner.endsWith("s") ? "'" : "'s"
} Dive Map`;
