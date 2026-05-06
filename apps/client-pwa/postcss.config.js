const path = require("path");

module.exports = {
  plugins: {
    // Ensure Tailwind resolves `tailwind.config.*` relative to this app.
    "@tailwindcss/postcss": { base: path.resolve(__dirname) },
    autoprefixer: {},
  },
};

