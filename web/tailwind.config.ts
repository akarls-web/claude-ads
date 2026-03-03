import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#193762",       // Midnight Blue — primary
          light: "#4180C2",         // Horizon Blue — accent / CTAs
          lighter: "#6BA3D6",       // Lighter accent tint
          subtle: "#D7D5D6",        // Fog Gray — borders / subtle bg
          wash: "#EDF2F8",          // Light Midnight tint — row alt / badges
          "dark-accent": "#4180C2", // Horizon Blue for dark mode
        },
        surface: {
          DEFAULT: "#F7F8FA",       // Cool neutral page bg
          dark: "#0A1A2F",          // Dark mode bg (Midnight family)
        },
        text: {
          primary: "#193762",       // Midnight Blue — headings
          secondary: "#3D5A80",     // Mid-blue — body secondary
          placeholder: "#BCB5AA",   // Sandstone — muted / placeholder
          "dark-primary": "#EDF2F8",
          "dark-secondary": "#6BA3D6",
        },
        border: {
          light: "#D7D5D6",         // Fog Gray
          dark: "#1E3A5F",          // Dark mode border
        },
        carbon: "#0A3449",
        emerald: "#4AA988",
        signal: "#C6385A",
        harvest: "#EEAE22",
        sandstone: "#BCB5AA",
        fog: "#D7D5D6",
        score: {
          a: "#4AA988",             // Emerald
          b: "#4AA988",             // Emerald (same for B)
          c: "#EEAE22",             // Harvest
          d: "#E8913A",             // Warm orange
          f: "#C6385A",             // Signal
        },
      },
      fontFamily: {
        sans: [
          "Neue Haas Grotesk Display Pro",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
        heading: ["Graveur Variable", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      fontSize: {
        display: [
          "48px",
          { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        h1: [
          "36px",
          { lineHeight: "1.2", letterSpacing: "-0.015em", fontWeight: "700" },
        ],
        h2: [
          "28px",
          { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "600" },
        ],
        h3: [
          "22px",
          { lineHeight: "1.4", letterSpacing: "-0.005em", fontWeight: "600" },
        ],
        body: ["16px", { lineHeight: "1.6" }],
        small: ["14px", { lineHeight: "1.5" }],
        caption: ["12px", { lineHeight: "1.4", fontWeight: "500" }],
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(25 55 98 / 0.05)",
        sm: "0 1px 3px 0 rgb(25 55 98 / 0.08), 0 1px 2px -1px rgb(25 55 98 / 0.06)",
        md: "0 4px 6px -1px rgb(25 55 98 / 0.08), 0 2px 4px -2px rgb(25 55 98 / 0.06)",
        lg: "0 10px 15px -3px rgb(25 55 98 / 0.08), 0 4px 6px -4px rgb(25 55 98 / 0.06)",
        xl: "0 20px 25px -5px rgb(25 55 98 / 0.08), 0 8px 10px -6px rgb(25 55 98 / 0.06)",
        brand: "0 4px 14px 0 rgb(65 128 194 / 0.25)",
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
    },
  },
  plugins: [],
};

export default config;
