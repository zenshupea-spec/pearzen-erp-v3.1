/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  // Scan all app sources in the monorepo so Tailwind can generate utilities
  // consistently from the root (PostCSS runs with monorepo cwd).
  content: [
    "./apps/*/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./apps/*/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Field PWA theme tokens (used by apps/field-pwa/app/globals.css).
      colors: {
        // Use flat color keys so the generated utility names match what the
        // app uses in `globals.css` / components (e.g. `bg-field-bg`).
        "field-bg": "#0f172a", // dark grey slate
        "field-fg": "#e5e7eb",
        "field-border": "rgba(255, 255, 255, 0.14)",
        "connection-ok": "#22c55e", // live-beaming green
      },
      backgroundImage: {
        "field-dots":
          "radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.08) 1px, transparent 0.5px)",
      },
      boxShadow: {
        "connection-glow":
          "0 0 12px rgba(34, 197, 94, 0.55), 0 0 26px rgba(34, 197, 94, 0.35)",
      },
      keyframes: {
        "connection-beam": {
          "0%, 100%": {
            opacity: "0.35",
            filter: "blur(0px) brightness(0.95)",
          },
          "50%": {
            opacity: "1",
            filter: "blur(0.2px) brightness(1.2)",
          },
        },
      },
      animation: {
        "connection-beam":
          "connection-beam 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

