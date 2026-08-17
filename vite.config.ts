import { defineConfig } from "vite"

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      // Forwards browser /api calls to the local bridge server
      // (scripts/chord-server.mjs), which does the actual Audiotool work
      // in Node — where the browser's blocked eval/WASM path doesn't apply.
      "/api": {
        target: "http://127.0.0.1:5174",
        changeOrigin: true,
      },
    },
  },
})
