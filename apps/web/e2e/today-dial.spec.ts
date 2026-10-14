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
import { readFileSync } from "node:fs";
import { planMessages as m, sharedMessages } from "../src/messages";
import { preAcceptTerms } from "./acceptTerms";

// Today: a "Now" card with time left, a 24-hour dial you can tap, and the
// rest of today as chips. The plan's day ribbon is gone from Today.

const TYO = readFileSync(
  new URL(
    "../../../packages/engine/test/fixtures/prg-tyo-advance.input.json",
    import.meta.url,
  ),
  "utf8",
);
const SHARE = `#p=${Buffer.from(TYO).toString("base64url")}`;

test.beforeEach(async ({ page }) => {
  await preAcceptTerms(page);
  // 09:10 in Tokyo on 17 Jan: inside the morning light window.
  await page.clock.install({ time: new Date("2027-01-17T00:10:00Z") });
  await page.goto(SHARE);
  await page.getByRole("button", { name: sharedMessages.save }).click();
  await page.waitForURL(/#\/plan\//);
  await page.goto("#/today");
});

test("Now shows time left as a bar, and the dial replaces the ribbon", async ({
  page,
}) => {
  const now = page.getByRole("region", { name: m.current });
  await expect(now.getByRole("progressbar")).toBeVisible();
  await expect(page.getByTestId("day-dial")).toBeVisible();
  await expect(page.getByTestId("phase-map")).toHaveCount(0);
});

test("tapping a part of the dial explains it", async ({ page }) => {
  await expect(page.getByText(m.dialHint)).toBeVisible();
  const light = page
    .getByTestId("day-dial")
    .getByRole("button", { name: /^Seek light, / })
    .first();
  await light.focus();
  await page.keyboard.press("Enter");
  await expect(light).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("status").filter({ hasText: "Seek light" }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByText(m.dialHint)).toBeVisible();
});

test("later today is a row of chips, and the page never scrolls sideways", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: m.laterToday })).toBeVisible();
  const extra = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(extra).toBe(0);
});
