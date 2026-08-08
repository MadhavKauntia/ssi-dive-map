import type { Config } from "tailwindcss";

// Palette is the mockup's source of truth — keep these names in lockstep with globals.css.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        abyss: "#05090c",
        ink: "#e7eef2",
        dim: "#8ea3ad",
        faint: "#5b6f78",
        teal: "#5fd0c4",
        "teal-soft": "#3a8f88",
        amber: "#ffcf8a",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
