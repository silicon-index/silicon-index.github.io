/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#0b0d12",
        "bg-raised": "#12151c",
        "bg-inset": "#0e1015",
        border: "#232734",
        "border-soft": "#1a1e28",
        text: "#e6e8ee",
        "text-dim": "#9aa1b0",
        "text-faint": "#5c6373",
        accent: "#4f8dfd",
        "accent-dim": "#2c5ba8",
        good: "#34d399",
        bad: "#f87171",
        warn: "#fbbf24"
      },
      fontFamily: {
        mono: ["SFMono-Regular", "Consolas", "Liberation Mono", "Menlo", "monospace"]
      }
    }
  },
  plugins: []
};
