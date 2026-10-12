/*
 * Copyright 2026 PhaseJumper contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import {
  PRECACHE_BUDGET_BYTES,
  precacheTotalBytes,
} from "./scripts/precache-budget";

// GitHub Pages serves the site at /<repo>/. Set VITE_BASE_PATH=/ for a custom-domain root.
const DEFAULT_BASE_PATH = "/phasejumper/";

function rebaseFontUrls(base: string): Plugin {
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return {
    name: "rebase-font-urls",
    enforce: "post",
    transform(code, id) {
      const file = id.split("?")[0] ?? id;
      if (!file.endsWith(".css") || !code.includes("/fonts/")) return null;
      const next = code
        .replaceAll('url("/fonts/', `url("${prefix}fonts/`)
        .replaceAll("url('/fonts/", `url('${prefix}fonts/`)
        .replaceAll("url(/fonts/", `url(${prefix}fonts/`);
      return next === code ? null : { code: next, map: null };
    },
  };
}

function precacheBudget(base: string): Plugin {
  return {
    name: "precache-budget",
    apply: "build",
    enforce: "post",
    closeBundle: {
      sequential: true,
      order: "post",
      handler() {
        const distDir = fileURLToPath(new URL("./dist/", import.meta.url));
        const serviceWorker = readFileSync(join(distDir, "sw.js"), "utf8");
        const total = precacheTotalBytes(serviceWorker, distDir, base);
        if (total > PRECACHE_BUDGET_BYTES) {
          throw new Error(
            `Precache is ${total} bytes, above the ${PRECACHE_BUDGET_BYTES} byte budget.`,
          );
        }
      },
    },
  };
}

export default defineConfig(() => {
  const base = process.env.VITE_BASE_PATH || DEFAULT_BASE_PATH;
  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      rebaseFontUrls(base),
      VitePWA({
        registerType: "prompt",
        injectRegister: false,
        manifest: {
          name: "PhaseJumper",
          short_name: "PhaseJumper",
          display: "standalone",
          theme_color: "#0B0B0D",
          background_color: "#0B0B0D",
          start_url: "./#/today",
          scope: "./",
          icons: [
            {
              src: "icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icons/icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          // The first install claims this page so offline works without a reload.
          // A later install stays waiting until Reload posts SKIP_WAITING.
          clientsClaim: true,
          skipWaiting: false,
          maximumFileSizeToCacheInBytes: PRECACHE_BUDGET_BYTES,
          // No runtime routes. Nothing is fetched from another origin.
          runtimeCaching: [],
          // Relative to the service worker, so it stays under the Pages base.
          navigateFallback: "index.html",
          globPatterns: ["**/*.{js,wasm,css,html,woff2,png,webmanifest}"],
        },
      }),
      precacheBudget(base),
    ],
  };
});
