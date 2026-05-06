import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      // Glass-related tokens are defined in CSS variables in `app/globals.css`.
    }
  },
  plugins: []
};

export default config;

