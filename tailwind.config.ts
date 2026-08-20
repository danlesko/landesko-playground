import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";
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
      // one place to retune the palette — except accent.visited, below.
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: "var(--surface)",
        muted: "var(--muted)",
        border: "var(--border)",
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          // violet-400, 6.51:1 on --background. A literal, not a var(), so the
          // value cannot depend on custom-property resolution inside the
          // privacy-restricted :visited selector.
          visited: "#a78bfa",
        },
        brand: "var(--brand)",
        danger: {
          DEFAULT: "var(--danger)",
          hover: "var(--danger-hover)",
        },
        focus: "var(--focus)",
      },
    },
  },
  plugins: [
    typography,
    scrollbar({ nocompatible: true }),
    forms({
      strategy: "class", // only generate classes
    }),
  ],
} satisfies Config;
