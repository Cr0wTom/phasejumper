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

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Visual baselines are platform-free and generated on CI's Linux Chromium
  // (docs/CONTRIBUTING.md); they are compared only on CI or with PW_VISUAL=1.
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  expect: {
    toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0 },
  },
  use: { trace: "on-first-retry" },
  projects: [
    {
      name: "chromium",
      testIgnore: "phasemap/**",
      use: {
        ...devices["Desktop Chrome"],
        // Native date/time fields take keyboard input in locale order.
        locale: "en-GB",
        baseURL: "http://127.0.0.1:4173/phasejumper/",
      },
    },
    {
      name: "phasemap",
      testDir: "e2e/phasemap",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4175/harness/",
      },
    },
  ],
  webServer: [
    {
      command:
        "pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173/phasejumper/",
      timeout: 120_000,
    },
    {
      command:
        "pnpm exec vite build --config vite.harness.config.ts && pnpm exec vite preview --config vite.harness.config.ts --host 127.0.0.1 --port 4175 --strictPort",
      url: "http://127.0.0.1:4175/harness/phasemap.html",
      timeout: 120_000,
    },
  ],
});
