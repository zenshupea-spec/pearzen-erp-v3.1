/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Flat keys so utility names match exactly (e.g. `bg-field-bg`).
        "field-bg": "#0f172a", // dark grey slate
        "field-fg": "#e5e7eb",
        "field-border": "rgba(255, 255, 255, 0.14)",
        "connection-ok": "#22c55e", // live-beaming green
      },
      backgroundImage: {
        // Grid dots background for the Field PWA.
        "field-dots":
          "radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.08) 1px, transparent 0.5px)",
      },
      boxShadow: {
        "connection-glow":
          "0 0 12px rgba(34, 197, 94, 0.55), 0 0 26px rgba(34, 197, 94, 0.35)",
      },
      keyframes: {
        "connection-beam": {
          "0%, 100%": { opacity: "0.35", filter: "blur(0px) brightness(0.95)" },
          "50%": { opacity: "1", filter: "blur(0.2px) brightness(1.2)" },
        },
      },
      animation: {
        "connection-beam": "connection-beam 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

