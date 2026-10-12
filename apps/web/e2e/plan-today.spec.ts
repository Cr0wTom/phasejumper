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
import { planMessages } from "../src/messages";

// T09 acceptance: share links, Today, offline, regenerate notice.

// Built here, independently of the app's codec: base64url of the JSON input.
const SFO = readFileSync(
  new URL(
    "../../../packages/engine/test/fixtures/prg-sfo-delay.input.json",
    import.meta.url,
  ),
  "utf8",
);
const SHARE = `#p=${Buffer.from(JSON.stringify(JSON.parse(SFO))).toString("base64url")}`;

interface Stored {
  id: string;
  engineVersion: string;
  result: unknown;
}

/** Reads a saved plan straight from IndexedDB (idb-keyval's default store). */
async function storedPlan(page: Page, id: string): Promise<Stored> {
  return page.evaluate(
    (key) =>
      new Promise<Stored>((resolve, reject) => {
        const open = indexedDB.open("keyval-store");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result
            .transaction("keyval")
            .objectStore("keyval")
            .get(key);
          get.onerror = () => reject(get.error);
          get.onsuccess = () => resolve(get.result as Stored);
        };
      }),
    `plan:${id}`,
  );
}

async function openShared(page: Page): Promise<string> {
  await page.goto(SHARE);
  await expect(page).toHaveURL(/#\/plan\/[0-9a-f-]{36}$/i);
  await expect(
    page.getByRole("heading", { name: planMessages.planHeading, level: 1 }),
  ).toBeVisible();
  return decodeURIComponent(page.url().split("#/plan/")[1] ?? "");
}

test("a share link reproduces the plan byte-for-byte in a fresh browser", async ({
  browser,
}) => {
  // Sender: open the plan and copy its share link.
  const sender = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const a = await sender.newPage();
  const idA = await openShared(a);
  await a.getByRole("button", { name: planMessages.share }).click();
  await expect(a.getByText(planMessages.shareCopied)).toBeVisible();
  const link = await a.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain("#p=");
  const planA = await storedPlan(a, idA);

  // Recipient: a brand-new browser context (no storage) opens the link.
  const recipient = await browser.newContext();
  const b = await recipient.newPage();
  await b.goto(link);
  await expect(b).toHaveURL(/#\/plan\/[0-9a-f-]{36}$/i);
  const idB = decodeURIComponent(b.url().split("#/plan/")[1] ?? "");
  const planB = await storedPlan(b, idB);

  expect(planB.engineVersion).toBe(planA.engineVersion);
  expect(JSON.stringify(planB.result)).toBe(JSON.stringify(planA.result));
  await sender.close();
  await recipient.close();
});

test("a damaged share link explains itself and changes nothing", async ({
  page,
}) => {
  await page.goto("#p=not-a-plan");
  await expect(page.getByRole("alert")).toHaveText(
    planMessages.shareUnreadable,
  );
});

test("Today shows the current and next block and counts down every 30 s", async ({
  page,
}) => {
  // Freeze time inside the plan: 2027-01-16 03:00 UTC is during day 1's sleep.
  await page.clock.install({ time: new Date("2027-01-16T03:00:00Z") });
  await openShared(page);
  await page.goto("#/today");
  const now = page.getByRole("region", { name: planMessages.current });
  const next = page.getByRole("region", { name: planMessages.next });
  await expect(now).toContainText("Sleep");
  await expect(next).toBeVisible();
  const before = await page
    .getByTestId(`${planMessages.current}-timing`)
    .textContent();

  // The 30-second tick updates the countdown without any interaction.
  await page.clock.runFor(60_000);
  await expect(
    page.getByTestId(`${planMessages.current}-timing`),
  ).not.toHaveText(before ?? "");

  // After the tab slept for hours (timers frozen), coming back recomputes.
  // 20:00 UTC on 16 Jan: landed in San Francisco (12:00 local), awake.
  await page.clock.setSystemTime(new Date("2027-01-16T20:00:00Z"));
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(page.getByTestId("now-line")).toHaveText(
    planMessages.nowAt("12:00", "Los Angeles"),
  );
  // Nothing is scheduled at noon; the arrival-day rest is next.
  await expect(now).toHaveCount(0);
  await expect(page.getByText(planMessages.nothingNow)).toBeVisible();
  await expect(next).toContainText("Rest");
});

test("Today works offline once the app is installed", async ({ page }) => {
  await openShared(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.context().setOffline(true);
  await page.goto("#/today");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: planMessages.todayHeading, level: 1 }),
  ).toBeVisible();
  await expect(page.getByTestId("now-line")).toBeVisible();
});

test("a plan from an older engine is rebuilt with a one-line notice", async ({
  page,
}) => {
  const id = await openShared(page);
  await page.evaluate(
    (key) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("keyval-store");
        open.onsuccess = () => {
          const store = open.result
            .transaction("keyval", "readwrite")
            .objectStore("keyval");
          const get = store.get(key);
          get.onsuccess = () => {
            const put = store.put(
              { ...get.result, engineVersion: "0.0.1" },
              key,
            );
            put.onsuccess = () => resolve();
            put.onerror = () => reject(put.error);
          };
        };
      }),
    `plan:${id}`,
  );
  await page.reload();
  await expect(
    page.getByRole("status").filter({ hasText: planMessages.regenerated }),
  ).toBeVisible();
  const saved = await storedPlan(page, id);
  expect(saved.engineVersion).not.toBe("0.0.1");
});

test("Edit trip opens the trip form filled from the plan", async ({ page }) => {
  await openShared(page);
  await page.getByRole("link", { name: planMessages.editTrip }).click();
  await expect(page).toHaveURL(/#\/trip\/[0-9a-f-]{36}$/i);
  await expect(
    page.getByRole("combobox", { name: "From", exact: true }),
  ).toHaveValue(/^PRG,/);
  await expect(page.getByLabel("Departure date", { exact: true })).toHaveValue(
    "2027-01-15",
  );
});

test("navigation marks the current screen", async ({ page }) => {
  await openShared(page);
  const nav = page.getByRole("navigation", { name: planMessages.nav.label });
  await expect(
    nav.getByRole("link", { name: planMessages.nav.plan }),
  ).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: planMessages.nav.today }).click();
  await expect(page).toHaveURL(/#\/today$/);
  await expect(
    nav.getByRole("link", { name: planMessages.nav.today }),
  ).toHaveAttribute("aria-current", "page");
});

for (const theme of ["dark", "light"] as const) {
  for (const screen of ["plan", "today"] as const) {
    test(`the ${screen} screen has no axe violations in the ${theme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.clock.install({ time: new Date("2027-01-16T03:00:00Z") });
      await openShared(page);
      if (screen === "today") {
        await page.goto("#/today");
        await expect(page.getByTestId("now-line")).toBeVisible();
      }
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }
}
