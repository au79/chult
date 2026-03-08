import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
  build: {
    rollupOptions: {
      input: {
        reactDm: resolve(__dirname, "react-dm.html"),
        reactPlayer: resolve(__dirname, "react-player.html"),
      },
    },
  },
});
