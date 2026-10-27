/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#9400D3",
          hover: "#7A00AD",
        },
      },
    },
  },
  plugins: [],
}

