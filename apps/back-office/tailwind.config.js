/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      keyframes: {
        "connection-beam": {
          "0%, 100%": { opacity: "0.4", filter: "blur(0px) brightness(0.95)" },
          "50%": { opacity: "1", filter: "blur(0.2px) brightness(1.15)" },
        },
      },
      animation: {
        "connection-beam": "connection-beam 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

