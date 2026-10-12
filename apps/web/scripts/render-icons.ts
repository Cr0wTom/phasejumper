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

// Renders the app icons from the ribbon-mark SVG source.
// Run from apps/web after changing public/icons/ribbon-mark.svg:
//   node scripts/render-icons.ts
// The square SVG fills the whole canvas; iOS and Android apply their own
// rounded mask, and the bars sit inside the maskable safe zone (≤ 40 % of
// the size from the centre), so the 512 image is also the maskable icon.

import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const dir = new URL("../public/icons/", import.meta.url);
const svg = readFileSync(new URL("ribbon-mark.svg", dir), "utf8");
const targets: Array<[string, number]> = [
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-maskable-512.png", 512],
];

const browser = await chromium.launch();
try {
  for (const [file, size] of targets) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
    });
    await page.setContent(
      `<html><body style="margin:0">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`,
    );
    await page.screenshot({ path: new URL(file, dir).pathname });
    await page.close();
  }
} finally {
  await browser.close();
}
