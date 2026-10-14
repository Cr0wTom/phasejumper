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
import { planMessages as m, sharedMessages } from "../src/messages";
import { preAcceptTerms } from "./acceptTerms";

// "How did you sleep last night?" on Today rebuilds the plan from the report;
// reports stay on the device and never go into share links.

const TYO = readFileSync(
  new URL(
    "../../../packages/engine/test/fixtures/prg-tyo-advance.input.json",
    import.meta.url,
  ),
  "utf8",
);
const SHARE = `#p=${Buffer.from(TYO).toString("base64url")}`;

async function stored(
  page: Page,
): Promise<{ input: { observedSleep?: unknown[] } }> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("keyval-store");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const store = open.result.transaction("keyval").objectStore("keyval");
          const last = store.get("meta:lastPlan");
          last.onsuccess = () => {
            const get = store.get(`plan:${String(last.result)}`);
            get.onsuccess = () => resolve(get.result);
            get.onerror = () => reject(get.error);
          };
        };
      }),
  );
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await preAcceptTerms(page);
  // 09:10 in Tokyo on 17 Jan, the morning after a planned night.
  await page.clock.install({ time: new Date("2027-01-17T00:10:00Z") });
  await page.goto(SHARE);
  await page.getByRole("button", { name: sharedMessages.save }).click();
  await page.waitForURL(/#\/plan\//);
  await page.goto("#/today");
});

test("reporting a different night rebuilds the plan and stays private", async ({
  page,
}) => {
  const card = page.getByRole("region", { name: m.checkinHeading });
  await expect(card).toBeVisible();
  // Fell asleep 2 h later than planned (the plan is advancing).
  const bed = card.getByLabel(m.checkinBed, { exact: true });
  const planned = await bed.inputValue();
  expect(planned).toMatch(/^\d{2}:\d{2}$/);
  const [h, mi] = planned.split(":").map(Number);
  const later = `${String(((h ?? 0) + 2) % 24).padStart(2, "0")}:${String(mi ?? 0).padStart(2, "0")}`;
  await bed.fill(later);
  await bed.press("Tab");
  await card.getByRole("button", { name: m.checkinSave }).click();
  await expect(card.getByRole("status")).toHaveText(m.checkinSaved);
  expect((await stored(page)).input.observedSleep).toHaveLength(1);

  // The plan's share link carries no reported sleep.
  await page.getByRole("link", { name: m.viewPlan }).click();
  await page.getByRole("button", { name: m.share }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const shared = Buffer.from(link.split("#p=")[1] ?? "", "base64url").toString(
    "utf8",
  );
  expect(shared).not.toContain("observedSleep");
});

test("a wake-up later than now is refused", async ({ page }) => {
  const card = page.getByRole("region", { name: m.checkinHeading });
  const wake = card.getByLabel(m.checkinWake, { exact: true });
  await wake.fill("11:30");
  await wake.press("Tab");
  await card.getByRole("button", { name: m.checkinSave }).click();
  await expect(card.getByRole("alert")).toHaveText(m.checkinFuture);
});

test("reporting the planned night changes nothing", async ({ page }) => {
  const card = page.getByRole("region", { name: m.checkinHeading });
  await card.getByRole("button", { name: m.checkinSave }).click();
  await expect(card.getByRole("status")).toHaveText(m.checkinSame);
  expect((await stored(page)).input.observedSleep).toBeUndefined();
});

for (const theme of ["dark", "light"] as const) {
  test(`the check-in has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.reload();
    await expect(
      page.getByRole("region", { name: m.checkinHeading }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
