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
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import {
  PRECACHE_BUDGET_BYTES,
  precacheTotalBytes,
  precacheUrls,
} from "../scripts/precache-budget";
import { messages, settingsMessages } from "../src/messages";
import { THEME_STORAGE_KEY } from "../src/theme";

const ORIGIN = "http://127.0.0.1:4173";

function trackForeign(page: Page): string[] {
  const foreign: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    if (url.origin !== ORIGIN) foreign.push(request.url());
  });
  return foreign;
}

async function waitForController(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

test("manifest, icons, and safe area are installable from the sub-path", async ({
  page,
}) => {
  const foreign = trackForeign(page);
  await page.goto("#/trip");
  await expect(
    page.getByRole("heading", { name: messages.tripHeading }),
  ).toBeVisible();
  await waitForController(page);

  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /viewport-fit=cover/,
  );
  await expect(
    page.locator('meta[name="apple-mobile-web-app-capable"]'),
  ).toHaveAttribute("content", "yes");
  await expect(
    page.locator('meta[name="apple-mobile-web-app-status-bar-style"]'),
  ).toHaveAttribute("content", "black-translucent");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    /icons\/apple-touch-icon\.png$/,
  );

  const manifestHref = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  expect(manifestHref).toBeTruthy();
  const manifestResponse = await page.request.get(manifestHref ?? "");
  expect(manifestResponse.status()).toBe(200);
  const manifest = (await manifestResponse.json()) as {
    name?: string;
    short_name?: string;
    display?: string;
    theme_color?: string;
    background_color?: string;
    start_url?: string;
    scope?: string;
    icons?: { src?: string; sizes?: string; purpose?: string; type?: string }[];
  };
  expect(manifest.name).toBe("PhaseJumper");
  expect(manifest.short_name).toBe("PhaseJumper");
  expect(manifest.display).toBe("standalone");
  expect(manifest.theme_color).toBe("#07080A");
  expect(manifest.background_color).toBe("#07080A");
  expect(manifest.start_url).toBe("./#/today");
  expect(manifest.scope).toBe("./");
  expect(manifest.icons).toEqual([
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
  ]);

  for (const file of [
    "fonts/Geist-Variable.woff2",
    "fonts/GeistMono-Variable.woff2",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-maskable-512.png",
    "icons/apple-touch-icon.png",
  ]) {
    const response = await page.request.get(file);
    expect(response.status(), file).toBe(200);
    expect((await response.body()).byteLength, file).toBeGreaterThan(32);
  }

  const fontFamily = await page
    .locator(".pj-shell")
    .evaluate((element) => getComputedStyle(element).fontFamily);
  expect(fontFamily).toContain("Geist");

  const css = await page.evaluate(() => {
    const chunks: string[] = [];
    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) chunks.push(rule.cssText);
    }
    return chunks.join("\n");
  });
  expect(css).toContain("safe-area-inset-top");
  expect(css).toContain("safe-area-inset-right");
  expect(css).toContain("safe-area-inset-bottom");
  expect(css).toContain("safe-area-inset-left");
  expect(css).toContain("env(safe-area-inset-top)");

  const client = await page.context().newCDPSession(page);
  await client.send("Page.enable");
  let emptyReads = 0;
  await expect
    .poll(async () => {
      const result = await client.send("Page.getInstallabilityErrors");
      const ids = result.installabilityErrors.map((error) => error.errorId);
      if (ids.length === 0) emptyReads += 1;
      else emptyReads = 0;
      return emptyReads >= 2 ? "ready" : ids.join(",") || "pending";
    })
    .toBe("ready");

  await expect(page.getByText(messages.updateReady)).toHaveCount(0);
  expect(foreign).toEqual([]);
});

test("trip form and airport search work offline", async ({ page }) => {
  await page.goto("#/trip");
  await expect(
    page.getByRole("heading", { name: messages.tripHeading }),
  ).toBeVisible();
  await waitForController(page);
  await page.context().setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: messages.tripHeading }),
  ).toBeVisible();
  const from = page.getByRole("combobox", { name: messages.fromAirport });
  await expect(from).toBeEnabled();
  await from.fill("PRG");
  await expect(page.getByRole("option", { name: /^PRG,/ })).toBeVisible();
});

test("loading and searching stay on this origin", async ({ page }) => {
  const foreign = trackForeign(page);
  const fontUrls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(".woff2")) fontUrls.push(request.url());
  });

  await page.goto("#/trip");
  const from = page.getByRole("combobox", { name: messages.fromAirport });
  await expect(from).toBeEnabled();
  await from.fill("HEL");
  await expect(page.getByRole("option", { name: /^HEL,/ })).toBeVisible();
  await expect.poll(() => fontUrls.length).toBeGreaterThan(0);
  for (const url of fontUrls) {
    expect(new URL(url).origin).toBe(ORIGIN);
    expect(url).toContain("/phasejumper/fonts/");
  }
  expect(foreign).toEqual([]);
});

test("theme choice in Settings survives a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("#/settings");
  const dark = page.getByRole("radio", { name: settingsMessages.themeDark });
  const light = page.getByRole("radio", { name: settingsMessages.themeLight });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(dark).toBeChecked();
  await light.check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect
    .poll(() =>
      page.evaluate((key) => {
        try {
          return localStorage.getItem(key);
        } catch {
          return "unavailable";
        }
      }, THEME_STORAGE_KEY),
    )
    .toBe("light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(light).toBeChecked();
});

test("first visit follows the device color scheme, otherwise dark", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("#/trip");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("first visit is dark when the color scheme cannot be read", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      if (query.includes("prefers-color-scheme")) {
        throw new Error("matchMedia blocked");
      }
      return original(query);
    };
  });
  await page.goto("#/trip");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("heading", { name: messages.tripHeading }),
  ).toBeVisible();
});

test("renders when storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    const deny = (): never => {
      throw new DOMException("storage blocked", "SecurityError");
    };
    Storage.prototype.getItem = deny;
    Storage.prototype.setItem = deny;
    Storage.prototype.removeItem = deny;
  });
  await page.goto("#/trip");
  await expect(
    page.getByRole("heading", { name: messages.tripHeading }),
  ).toBeVisible();
  await page.goto("#/settings");
  await page.getByRole("radio", { name: settingsMessages.themeLight }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("precache stays within 3 MiB", () => {
  const serviceWorker = readFileSync(
    new URL("../dist/sw.js", import.meta.url),
    "utf8",
  );
  const distDir = fileURLToPath(new URL("../dist/", import.meta.url));
  const urls = precacheUrls(serviceWorker);
  const total = precacheTotalBytes(serviceWorker, distDir);
  expect(urls.some((url) => url.endsWith(".woff2"))).toBe(true);
  expect(urls.some((url) => url.endsWith(".png"))).toBe(true);
  expect(urls.some((url) => url.endsWith(".js"))).toBe(true);
  expect(total).toBeGreaterThan(500_000);
  expect(total).toBeLessThanOrEqual(PRECACHE_BUDGET_BYTES);
});
