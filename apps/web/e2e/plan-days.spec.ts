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
  phaseMapMessages,
  planMessages as m,
  sharedMessages,
} from "../src/messages";
import { preAcceptTerms } from "./acceptTerms";

// The plan page shows the map and day chips; a day's detail opens in a sheet.

const SFO = readFileSync(
  new URL(
    "../../../packages/engine/test/fixtures/prg-sfo-delay.input.json",
    import.meta.url,
  ),
  "utf8",
);
const SHARE = `#p=${Buffer.from(JSON.stringify(JSON.parse(SFO))).toString("base64url")}`;

async function openPlan(page: Page): Promise<void> {
  await preAcceptTerms(page);
  await page.goto(SHARE);
  // Shared links open in view mode; save to keep the plan on this device.
  await page.getByRole("button", { name: sharedMessages.save }).click();
  await expect(page).toHaveURL(/#\/plan\//);
}

test("the plan page lists days as chips, not every day's detail", async ({
  page,
}) => {
  await openPlan(page);
  const chips = page
    .getByRole("navigation", { name: m.daysHeading })
    .getByRole("button");
  await expect(chips.first()).toHaveText(/^Day 1 · /);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // No day's block reasons are on the page until a day is opened.
  await expect(page.getByText(m.adviceHeading)).toHaveCount(0);
});

test("a day chip opens the sheet; arrows move days; Escape closes", async ({
  page,
}) => {
  await openPlan(page);
  const chips = page
    .getByRole("navigation", { name: m.daysHeading })
    .getByRole("button");
  await chips.nth(1).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { level: 2 })).toHaveText(/^Day 2, /);
  await expect(chips.nth(1)).toHaveAttribute("aria-current", "date");
  await sheet.getByRole("button", { name: m.nextDay }).click();
  await expect(sheet.getByRole("heading", { level: 2 })).toHaveText(/^Day 3, /);
  await sheet.getByRole("button", { name: m.previousDay }).click();
  await sheet.getByRole("button", { name: m.previousDay }).click();
  await expect(sheet.getByRole("heading", { level: 2 })).toHaveText(/^Day 1, /);
  await expect(
    sheet.getByRole("button", { name: m.previousDay }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the day sheet lists the three exercise windows", async ({ page }) => {
  await openPlan(page);
  const chips = page
    .getByRole("navigation", { name: m.daysHeading })
    .getByRole("button");
  await chips.nth(2).click();
  const sheet = page.getByRole("dialog");
  await expect(
    sheet.getByText(phaseMapMessages.kinds.EXERCISE_GOOD).first(),
  ).toBeVisible();
  await expect(
    sheet.getByText(phaseMapMessages.kinds.EXERCISE_OK).first(),
  ).toBeVisible();
  await expect(
    sheet.getByText(phaseMapMessages.kinds.EXERCISE_AVOID).first(),
  ).toBeVisible();
});

test("choosing a phase-map row opens that day", async ({ page }) => {
  await openPlan(page);
  const row = page.locator('[data-date="2027-01-17"]');
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog").getByRole("heading", { level: 2 }),
  ).toContainText("17 Jan");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: m.closeDay })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await row.locator("text").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

for (const theme of ["dark", "light"] as const) {
  test(`the open day sheet has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await openPlan(page);
    await page
      .getByRole("navigation", { name: m.daysHeading })
      .getByRole("button")
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

test("the map joins the body-clock dots and marks today", async ({ page }) => {
  await page.clock.install({ time: new Date("2027-01-17T20:00:00Z") });
  await openPlan(page);
  const path = page.getByTestId("phase-trajectory");
  // At least two joined segments: the drift reads as one line.
  await expect(path).toHaveAttribute("d", /L.*L/);
  const today = page.locator('[data-date="2027-01-17"]');
  await expect(today.locator("[data-today]")).toHaveCount(1);
  await expect(page.locator('[data-date="2027-01-15"]')).toHaveCSS(
    "opacity",
    "0.5",
  );
  await expect(today).toHaveCSS("opacity", "1");
});

test("on phones the whole day is drawn at the top of the sheet; touching it highlights the list", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPlan(page);
  await page.locator('[data-date="2027-01-17"]').click();
  const dialog = page.getByRole("dialog");
  const view = dialog.getByTestId("day-view");
  await expect(view).toBeVisible();
  // The drawn day is the top of the sheet, above its heading.
  const viewBox = await view.boundingBox();
  const heading = await dialog.getByRole("heading", { level: 2 }).boundingBox();
  expect((viewBox?.y ?? 0) + (viewBox?.height ?? 0)).toBeLessThan(
    heading?.y ?? 0,
  );
  // Shapes only: the drawing carries no text.
  await expect(view.locator("text")).toHaveCount(0);
  // Touching the drawing highlights what is going on then in the list.
  const box = await view.boundingBox();
  if (box === null) throw new Error("no day view");
  const at = (hour: number): number => box.x + (box.width * hour) / 24;
  const active = dialog.locator("li[data-active]");
  await expect(active).toHaveCount(0);
  await page.mouse.move(at(8), box.y + box.height / 2);
  await page.mouse.down();
  // 08:00 in Los Angeles: caffeine fits; the ideal exercise window is later.
  await expect(
    active.filter({ hasText: phaseMapMessages.kinds.CAFFEINE_OK }),
  ).toHaveCount(1);
  await expect(
    active.filter({ hasText: phaseMapMessages.kinds.EXERCISE_GOOD }),
  ).toHaveCount(0);
  // Dragging to 13:30: the ideal exercise window.
  await page.mouse.move(at(13.5), box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(
    active.filter({ hasText: phaseMapMessages.kinds.EXERCISE_GOOD }),
  ).toHaveCount(1);
  await expect(dialog.getByTestId("day-view-cursor")).toBeAttached();
  // Tapping above the sheet closes it.
  await page.mouse.click(195, 40);
  await expect(dialog).toHaveCount(0);
});

test("wide screens keep the side panel without the drawn day", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openPlan(page);
  await page.locator('[data-date="2027-01-17"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByTestId("day-view")).toBeHidden();
});
