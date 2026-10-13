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
import { messages } from "../src/messages";
import { preAcceptTerms } from "./acceptTerms";

// Desktop Chromium (fine pointer). The webkit project covers the native input.

test.beforeEach(async ({ page }) => {
  await preAcceptTerms(page);
});

function labeled(page: Page, name: string) {
  return page.getByLabel(name, { exact: true });
}

interface StoredPlan {
  input: {
    itinerary: {
      legs: { departureLocal: string }[];
    };
  };
}

async function storedPlan(page: Page, id: string): Promise<StoredPlan> {
  return page.evaluate(
    (key) =>
      new Promise<StoredPlan>((resolve, reject) => {
        const open = indexedDB.open("keyval-store");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result
            .transaction("keyval")
            .objectStore("keyval")
            .get(key);
          get.onerror = () => reject(get.error);
          get.onsuccess = () => resolve(get.result as StoredPlan);
        };
      }),
    `plan:${id}`,
  );
}

async function chooseAirport(
  page: Page,
  label: string,
  code: string,
): Promise<void> {
  await labeled(page, label).fill(code);
  await page.getByRole("option", { name: new RegExp(`^${code},`) }).click();
}

test("typing 7:45 pm stores 19:45 on the plan", async ({ page }) => {
  await page.goto("#/trip");
  await expect(labeled(page, messages.fromAirport)).toBeEnabled();
  await chooseAirport(page, messages.fromAirport, "PRG");
  await chooseAirport(page, messages.toAirport, "JFK");
  await labeled(page, messages.departureDate).fill("2027-01-18");
  const departure = labeled(page, messages.departureTime);
  await departure.click();
  await page.keyboard.type("7:45 pm");
  await page.keyboard.press("Tab");
  await expect(departure).toHaveValue("19:45");
  await labeled(page, messages.arrivalDate).fill("2027-01-18");
  await labeled(page, messages.arrivalTime).fill("22:00");
  await page.getByRole("button", { name: messages.generate }).click();

  await expect(page).toHaveURL(/#\/plan\/[0-9a-f-]{36}$/i);
  const id = decodeURIComponent(page.url().split("#/plan/")[1] ?? "");
  const plan = await storedPlan(page, id);
  expect(plan.input.itinerary.legs[0]?.departureLocal).toBe("2027-01-18T19:45");
});

test("an unreadable time blocks the plan and shows an error", async ({
  page,
}) => {
  await page.goto("#/trip");
  await expect(labeled(page, messages.fromAirport)).toBeEnabled();
  await chooseAirport(page, messages.fromAirport, "PRG");
  await chooseAirport(page, messages.toAirport, "JFK");
  await labeled(page, messages.departureDate).fill("2027-01-18");
  const departure = labeled(page, messages.departureTime);
  await departure.click();
  await page.keyboard.type("abc");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("alert")).toHaveText(messages.timeUnreadable);
  await labeled(page, messages.arrivalDate).fill("2027-01-18");
  await labeled(page, messages.arrivalTime).fill("22:00");
  await page.getByRole("button", { name: messages.generate }).click();

  await expect(page).toHaveURL(/#\/trip$/);
  await expect(page.getByText(messages.timeUnreadable)).toBeVisible();
});

test("ArrowDown opens the list, Enter and click select, Escape closes", async ({
  page,
}) => {
  await page.goto("#/trip");
  const bedtime = labeled(page, messages.bedtime);
  const listName = messages.timeOptions(messages.bedtime);
  await bedtime.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(bedtime).toHaveValue("23:00");
  await expect(bedtime).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press("ArrowDown");
  const list = page.getByRole("listbox", { name: listName });
  await expect(list).toBeVisible();
  await expect(bedtime).toHaveAttribute("aria-expanded", "true");
  await expect(list.getByRole("option")).toHaveCount(288);
  await expect(list.getByRole("option").first()).toHaveText("00:00");
  await expect(list.getByRole("option").last()).toHaveText("23:55");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(bedtime).toHaveValue("23:05");

  await bedtime.click();
  await page.getByRole("option", { name: "23:30", exact: true }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(bedtime).toHaveValue("23:30");
});

test("a typed time on a 5-minute step is highlighted and picked", async ({
  page,
}) => {
  await page.goto("#/trip");
  const departure = labeled(page, messages.departureTime);
  await departure.click();
  await page.keyboard.type("7:05");
  await expect(
    page.getByRole("listbox").getByRole("option", { selected: true }),
  ).toHaveText("07:05");
  await page.keyboard.press("Enter");
  await expect(departure).toHaveValue("07:05");
});

test("a typed time between steps is offered exactly", async ({ page }) => {
  await page.goto("#/trip");
  const departure = labeled(page, messages.departureTime);
  await departure.click();
  await page.keyboard.type("7:07");
  const list = page.getByRole("listbox");
  await expect(list.getByRole("option", { selected: true })).toHaveText(
    "07:07",
  );
  await expect(list.getByRole("option")).toHaveCount(289);
  await page.keyboard.press("Enter");
  await expect(departure).toHaveValue("07:07");
});

for (const theme of ["dark", "light"] as const) {
  test(`the open time list has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("#/trip");
    await expect(labeled(page, messages.fromAirport)).toBeEnabled();
    await labeled(page, messages.bedtime).click();
    await expect(
      page.getByRole("listbox", {
        name: messages.timeOptions(messages.bedtime),
      }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
