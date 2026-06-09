import type { Config } from "tailwindcss";

/**
 * The Element Six corporate palette is defined once as CSS variables in
 * src/app/globals.css. Tailwind tokens below reference those variables so we
 * never scatter raw hex values through components. To re-theme, change the
 * variables in globals.css.
 */
const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand
        orange: {
          DEFAULT: "rgb(var(--e6-orange) / <alpha-value>)",
          fg: "rgb(var(--e6-orange-fg) / <alpha-value>)",
        },
        eternal: {
          DEFAULT: "rgb(var(--e6-eternal) / <alpha-value>)",
          50: "rgb(var(--e6-eternal-50) / <alpha-value>)",
          100: "rgb(var(--e6-eternal-100) / <alpha-value>)",
        },
        // Accents
        brilliant: "rgb(var(--e6-brilliant) / <alpha-value>)",
        vivid: "rgb(var(--e6-vivid) / <alpha-value>)",
        vibrant: "rgb(var(--e6-vibrant) / <alpha-value>)",
        violet: "rgb(var(--e6-violet) / <alpha-value>)",
        // Functional
        cool: "rgb(var(--e6-cool) / <alpha-value>)",
        // Semantic surface tokens
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          muted: "rgb(var(--surface-muted) / <alpha-value>)",
          inset: "rgb(var(--surface-inset) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          subtle: "rgb(var(--ink-subtle) / <alpha-value>)",
        },
        line: "rgb(var(--line) / <alpha-value>)",
        // Status
        success: "rgb(var(--status-success) / <alpha-value>)",
        warning: "rgb(var(--status-warning) / <alpha-value>)",
        danger: "rgb(var(--status-danger) / <alpha-value>)",
        info: "rgb(var(--status-info) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "0.75rem",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "pulse-soft": "pulse-soft 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
