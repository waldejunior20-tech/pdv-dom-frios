/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "dom-marinho": "#013750",
        "dom-laranja": "#f23e02",
        "dom-teal": "#00988d",
        "dom-petroleo": "#2c6b74",
        "dom-creme": "#fef5c8",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
