/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: { night: "#0f1311", canopy: "#1b2a20", moss: "#24362a", fern: "#3d6b45", olive: "#7d8a45",
              parchment: "#efe4c8", sand: "#cdbf9a", gold: "#b8923a", ember: "#d9715c" },
    fontFamily: { display: ["Fraunces", "Georgia", "serif"], body: ['"Instrument Sans"', "system-ui", "sans-serif"] },
  } },
  plugins: [],
};
