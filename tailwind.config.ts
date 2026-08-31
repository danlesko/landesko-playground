import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";
import scrollbar from "tailwind-scrollbar";

export default {
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@rewind-ui/core/dist/theme/styles/*.js",
  ],
  theme: {
    extend: {
      // Semantic tokens. Values live in src/app/globals.css so there is exactly
      // one place to retune the palette.
      colors: {
        background: "var(--background)",
        backdrop: "var(--backdrop)",
        foreground: "var(--foreground)",
        surface: "var(--surface)",
        muted: "var(--muted)",
        border: "var(--border)",
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          visited: "var(--accent-visited)",
        },
        brand: {
          DEFAULT: "var(--brand)",
          hover: "var(--brand-hover)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          hover: "var(--danger-hover)",
          fill: "var(--danger-fill)",
          "fill-hover": "var(--danger-fill-hover)",
        },
        focus: "var(--focus)",
      },
    },
  },
  plugins: [
    // No `@tailwindcss/typography`. It was declared and nothing used it: there is
    // no `prose` class anywhere in src, and the two rewind-ui styles that mention
    // the word use `max-w-prose`, which is a CORE Tailwind width utility rather
    // than this plugin's. Measured before removing it -- see the note in
    // src/components/ui/card.ts for what it was costing.
    scrollbar({ nocompatible: true }),
    forms({
      strategy: "class", // only generate classes
    }),
  ],
} satisfies Config;
