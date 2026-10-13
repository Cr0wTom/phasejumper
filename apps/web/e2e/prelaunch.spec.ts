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

import { expect, test } from "@playwright/test";
import { messages } from "../src/messages";
import { preAcceptTerms } from "./acceptTerms";

test.beforeEach(async ({ page }) => {
  await preAcceptTerms(page);
});

for (const width of [390, 1280]) {
  for (const hash of ["#/plan", "#/today"]) {
    test(`${hash} with no plan does not scroll at ${width} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(hash);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}

test("a field's error clears as soon as the field is corrected", async ({
  page,
}) => {
  await page.goto("#/trip");
  const bedtime = page.getByLabel(messages.bedtime, { exact: true });
  const wake = page.getByLabel(messages.wake, { exact: true });
  await bedtime.fill("07:00");
  await wake.fill("07:00");
  await page.getByRole("button", { name: messages.generate }).click();
  await expect(page.getByText(messages.timesSame)).toBeVisible();
  await bedtime.fill("23:00");
  await expect(page.getByText(messages.timesSame)).toHaveCount(0);
});

for (const hash of ["#/", "#/trip", "#/settings", "#/evidence", "#/legal"]) {
  test(`${hash} is never wider than a phone screen`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(hash);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const extra = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(extra).toBe(0);
  });
}

test("a half-typed date says what is missing; a 2-digit year is refused", async ({
  page,
}) => {
  await page.goto("#/trip");
  const departure = page.getByLabel(messages.departureDate, { exact: true });
  await departure.click();
  await page.keyboard.type("1104");
  // Tab moves between the day/month/year parts; leave the field instead.
  await page.getByRole("heading", { level: 1 }).click();
  await expect(page.getByText(messages.dateIncomplete)).toBeVisible();
  // Typing the full date clears it.
  await departure.click();
  await page.keyboard.type("11042027");
  await page.getByRole("heading", { level: 1 }).click();
  await expect(page.getByText(messages.dateIncomplete)).toHaveCount(0);
  await expect(departure).toHaveValue(/^2027-/);

  await departure.fill("0026-11-04");
  await page.getByRole("button", { name: messages.generate }).click();
  await expect(page.getByText(messages.dateYear).first()).toBeVisible();
});
