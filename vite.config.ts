import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "The Padel Series: Survivor",
        short_name: "Padel Survivor",
        description: "Survivor-style padel competition",
        theme_color: "#0e1410",
        background_color: "#0e1410",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [
          // Never cache Supabase traffic
          { urlPattern: ({ url }) => url.hostname.endsWith("supabase.co"), handler: "NetworkOnly" },
          { urlPattern: ({ request }) => request.mode === "navigate", handler: "NetworkFirst",
            options: { cacheName: "pages", networkTimeoutSeconds: 4 } },
        ],
      },
    }),
  ],
});
