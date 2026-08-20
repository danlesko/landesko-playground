import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";
import scrollbar from "tailwind-scrollbar";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@rewind-ui/core/dist/theme/styles/*.js",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      gridTemplateRows: {
        layout: "auto 1fr", // Adjust based on the layout needs
      },
      gridTemplateColumns: {
        layout: "250px 1fr", // Sidebar and main content areas
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
