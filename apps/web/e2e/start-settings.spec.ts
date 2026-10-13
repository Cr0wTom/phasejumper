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

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  feedbackMessages,
  planMessages,
  settingsMessages as s,
  startMessages,
} from "../src/messages";
import { preAcceptTerms } from "./acceptTerms";

test.beforeEach(async ({ page }) => {
  await preAcceptTerms(page);
});

// T13 acceptance: Start, Settings (theme, export, import, forget) and the
// evidence page; no network calls; axe clean in both themes.

const SFO = readFileSync(
  new URL(
    "../../../packages/engine/test/fixtures/prg-sfo-delay.input.json",
    import.meta.url,
  ),
  "utf8",
);
const SHARE = `#p=${Buffer.from(JSON.stringify(JSON.parse(SFO))).toString("base64url")}`;

async function savedKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open("keyval-store");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          // A browser that never saved anything has no store yet.
          if (!open.result.objectStoreNames.contains("keyval")) {
            resolve([]);
            return;
          }
          const req = open.result
            .transaction("keyval")
            .objectStore("keyval")
            .getAllKeys();
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result.map(String));
        };
      }),
  );
}

async function openShared(page: Page): Promise<void> {
  await page.goto(SHARE);
  await expect(page).toHaveURL(/#\/plan\/[0-9a-f-]{36}$/i);
}

function decodeMailtoBody(href: string): string {
  const marker = "&body=";
  const at = href.indexOf(marker);
  if (at < 0) throw new Error("Feedback mailto URL has no body.");
  return decodeURIComponent(href.slice(at + marker.length));
}

test("Start shows the example ribbon, Plan a trip and the footer", async ({
  page,
}) => {
  await page.goto("#/");
  await expect(
    page.getByRole("heading", { name: startMessages.heading, level: 1 }),
  ).toBeVisible();
  const example = page.getByRole("region", {
    name: startMessages.exampleHeading,
  });
  await expect(example.locator("svg").first()).toBeVisible();
  await expect(page.getByText(startMessages.savedNone)).toBeVisible();
  await expect(page.locator("footer")).toContainText("not medical advice");
  await page.getByRole("link", { name: startMessages.planTrip }).click();
  await expect(page).toHaveURL(/#\/trip$/);
});

test("an unknown hash lands on Start", async ({ page }) => {
  await page.goto("#/nowhere");
  await expect(page).toHaveURL(/#\/$/);
  await expect(
    page.getByRole("heading", { name: startMessages.heading, level: 1 }),
  ).toBeVisible();
});

test("Start lists saved plans and opens them", async ({ page }) => {
  await openShared(page);
  const url = page.url();
  await page.goto("#/");
  const saved = page.getByRole("region", { name: startMessages.savedHeading });
  const link = saved.getByRole("link", { name: /^PRG to SFO, / });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(url);
});

test("export, forget all trips, then import restores the plan", async ({
  page,
}) => {
  await openShared(page);
  await page.goto("#/settings");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: s.exportButton }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^phasejumper-plans-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const file = await download.path();
  const backup = JSON.parse(readFileSync(file, "utf8")) as {
    format: string;
    plans: Array<{ input: unknown }>;
  };
  expect(backup.format).toBe("phasejumper-plans");
  expect(backup.plans.map((p) => p.input)).toEqual([JSON.parse(SFO)]);
  await expect(page.getByRole("status")).toHaveText(s.exportDone(1));

  // Forget needs a second, explicit confirmation; Cancel keeps everything.
  await page.getByRole("button", { name: s.forgetButton }).click();
  await expect(page.getByText(s.forgetConfirm)).toBeVisible();
  await page.getByRole("button", { name: s.forgetCancel }).click();
  expect((await savedKeys(page)).some((k) => k.startsWith("plan:"))).toBe(true);
  await page.getByRole("button", { name: s.forgetButton }).click();
  await page.getByRole("button", { name: s.forgetYes }).click();
  await expect(page.getByRole("status")).toHaveText(s.forgetDone);
  expect(await savedKeys(page)).toEqual([]);
  await page.goto("#/plan");
  await expect(page.getByText(planMessages.noPlan)).toBeVisible();

  await page.goto("#/settings");
  await page.getByLabel(s.importLabel).setInputFiles(file);
  await expect(page.getByRole("status")).toHaveText(s.importDone(1));
  await page.goto("#/");
  await expect(page.getByRole("link", { name: /^PRG to SFO, / })).toBeVisible();
});

test("import explains a bad file and saves nothing", async ({ page }) => {
  await page.goto("#/settings");
  const input = page.getByLabel(s.importLabel);
  await input.setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{ not json"),
  });
  await expect(page.getByRole("alert")).toHaveText(s.importNotJson);
  await input.setInputFiles({
    name: "other.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"hello": "world"}'),
  });
  await expect(page.getByRole("alert")).toHaveText(s.importNotPlans);
  const bad = JSON.parse(SFO) as { traveler: Record<string, unknown> };
  bad.traveler.habitualBedtime = "25:99";
  await input.setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(bad)),
  });
  await expect(page.getByRole("alert")).toContainText("Nothing was imported");
  expect((await savedKeys(page)).filter((k) => k.startsWith("plan:"))).toEqual(
    [],
  );
});

test("Settings feedback links are mailto and omit the trip", async ({
  page,
}) => {
  await openShared(page);
  await page.goto("#/settings");

  const bug = page.getByRole("link", {
    name: feedbackMessages.bugLink,
    exact: true,
  });
  const feature = page.getByRole("link", {
    name: feedbackMessages.featureLink,
    exact: true,
  });
  const prefix = `mailto:${feedbackMessages.address}?subject=`;
  await expect(bug).toBeVisible();
  await expect(feature).toBeVisible();
  await expect(bug).toHaveAttribute("href", /engineVersion/);

  const bugHref = await bug.getAttribute("href");
  const featureHref = await feature.getAttribute("href");
  if (bugHref === null || featureHref === null) {
    throw new Error("Feedback link is missing an href.");
  }
  expect(bugHref.startsWith(prefix)).toBe(true);
  expect(featureHref.startsWith(prefix)).toBe(true);

  const body = decodeMailtoBody(bugHref);
  expect(body).toContain("engineVersion");
  const plan = JSON.parse(SFO) as {
    itinerary: {
      legs: Array<{ departureAirport: string; arrivalAirport: string }>;
    };
  };
  for (const leg of plan.itinerary.legs) {
    expect(body).not.toContain(leg.departureAirport);
    expect(body).not.toContain(leg.arrivalAirport);
  }
});

test("the evidence page renders from docs/EVIDENCE.md", async ({ page }) => {
  await page.goto("#/settings");
  await page.getByRole("link", { name: s.evidenceLink }).click();
  await expect(page).toHaveURL(/#\/evidence$/);
  await expect(
    page.getByRole("heading", {
      name: "The research behind your plan",
      level: 1,
    }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: planMessages.nav.label });
  await expect(
    nav.getByRole("link", { name: planMessages.nav.settings }),
  ).toHaveAttribute("aria-current", "page");
  const external = page.locator('article a[href^="https://"]');
  expect(await external.count()).toBeGreaterThan(5);
  for (const a of await external.all()) {
    await expect(a).toHaveAttribute("target", "_blank");
    await expect(a).toHaveAttribute("rel", "noopener noreferrer");
  }
});

test("Start, Settings and evidence make no third-party requests", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? "http://localhost").origin;
  const foreign: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    if (new URL(url).origin !== origin) foreign.push(url);
  });
  await openShared(page);
  for (const hash of ["#/", "#/settings", "#/evidence"]) {
    await page.goto(hash);
    await page.waitForLoadState("networkidle");
  }
  await page.goto("#/settings");
  await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: s.exportButton }).click(),
  ]);
  expect(foreign).toEqual([]);
});

for (const theme of ["dark", "light"] as const) {
  for (const hash of ["#/", "#/settings", "#/evidence"] as const) {
    test(`${hash} has no axe violations in the ${theme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await openShared(page);
      await page.goto(hash);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (hash === "#/") {
        await expect(
          page.getByRole("link", { name: /^PRG to SFO, / }),
        ).toBeVisible();
      }
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }
}
