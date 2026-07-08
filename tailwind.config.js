/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0F1626",
        signal: "#2F6F5E",
        amber: "#E0A75E",
        mist: "#EDEBE4",
        wire: "#3A4658",
      },
      fontFamily: {
        display: ["'IBM Plex Sans'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        scan: "scan 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
