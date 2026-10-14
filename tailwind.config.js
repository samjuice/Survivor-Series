/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: { ink: "#0e1410", moss: "#1d2a1f", forest: "#2f5233", olive: "#6b7a3a", sand: "#e8dcc0", parchment: "#f4ecd8", gold: "#c9a227" },
    fontFamily: { display: ["Oswald","Impact","sans-serif"], body: ["Inter","system-ui","sans-serif"] },
  } },
  plugins: [],
};
