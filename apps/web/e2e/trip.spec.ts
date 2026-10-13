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
import { messages, planMessages } from "../src/messages";
import { preAcceptTerms } from "./acceptTerms";

test.beforeEach(async ({ page }) => {
  await preAcceptTerms(page);
});

const ORIGIN = "http://127.0.0.1:4173";

async function focusedName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return "";
    if (el.tagName === "BUTTON" || el.tagName === "A") {
      return (el.textContent ?? "").replace(/\s+/g, " ").trim();
    }
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy !== null) {
      return labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }
    const aria = el.getAttribute("aria-label");
    if (aria !== null) return aria.trim();
    if (el.id !== "") {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label?.textContent !== undefined && label.textContent !== null) {
        return label.textContent.replace(/\s+/g, " ").trim();
      }
    }
    const wrap = el.closest("label");
    return (wrap?.textContent ?? "").replace(/\s+/g, " ").trim();
  });
}

async function tabUntil(page: Page, name: string): Promise<void> {
  for (let step = 0; step < 40; step += 1) {
    if ((await focusedName(page)) === name) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`No focused control named ${name}`);
}

/** Playwright's getByLabel is a case-insensitive substring match. "To" also matches "Days to shift before you fly". */
function labeled(page: Page, name: string) {
  return page.getByLabel(name, { exact: true });
}

async function chooseAirport(
  page: Page,
  label: string,
  code: string,
): Promise<void> {
  await tabUntil(page, label);
  await page.keyboard.type(code);
  await expect(
    page.getByRole("option", { name: new RegExp(`^${code},`) }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(labeled(page, label)).toHaveValue(new RegExp(`^${code},`));
}

test("creates a plan with the network disabled and no other origin", async ({
  page,
}) => {
  const foreign: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    if (url.origin !== ORIGIN) foreign.push(request.url());
  });

  await page.goto("#/trip");
  await expect(
    page.getByRole("combobox", { name: messages.fromAirport }),
  ).toBeEnabled();
  await page.context().setOffline(true);

  await labeled(page, messages.fromAirport).fill("PRG");
  await page.getByRole("option", { name: /^PRG,/ }).click();
  await labeled(page, messages.toAirport).fill("JFK");
  await page.getByRole("option", { name: /^JFK,/ }).click();
  await labeled(page, messages.departureDate).fill("2027-01-18");
  await labeled(page, messages.departureTime).fill("10:00");
  await labeled(page, messages.arrivalDate).fill("2027-01-18");
  await labeled(page, messages.arrivalTime).fill("13:00");
  await page.getByRole("button", { name: messages.generate }).click();

  await expect(page).toHaveURL(/#\/plan\/[0-9a-f-]{36}$/i);
  await expect(
    page.getByRole("heading", { name: planMessages.planHeading, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(messages.footer, { exact: true })).toBeVisible();
  expect(foreign).toEqual([]);
});

test("completes the form with the keyboard only", async ({ page }) => {
  await page.goto("#/trip");
  await expect(
    page.getByRole("combobox", { name: messages.fromAirport }),
  ).toBeEnabled();

  await chooseAirport(page, messages.fromAirport, "PRG");
  await chooseAirport(page, messages.toAirport, "JFK");
  await tabUntil(page, messages.departureDate);
  // Native pickers take keystrokes segment by segment in the BROWSER's UI
  // order, which differs by platform (day-first or month-first, 12 h or
  // 24 h). Keep the keystrokes order-proof: day = month (1 Jan), and an
  // "A" that a 12 h field reads as AM and a 24 h field ignores.
  await page.keyboard.type("01012027");
  await tabUntil(page, messages.departureTime);
  await page.keyboard.type("1000A");
  await tabUntil(page, messages.arrivalDate);
  await page.keyboard.type("01012027");
  await tabUntil(page, messages.arrivalTime);
  await page.keyboard.type("1100A");
  // Desktop time fields keep the typed text until blur, then show HH:MM.
  await labeled(page, messages.arrivalTime).blur();
  await expect(labeled(page, messages.departureDate)).toHaveValue("2027-01-01");
  await expect(labeled(page, messages.departureTime)).toHaveValue("10:00");
  await expect(labeled(page, messages.arrivalTime)).toHaveValue("11:00");
  await tabUntil(page, messages.generate);
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/#\/plan\/[0-9a-f-]{36}$/i);
  await expect(
    page.getByRole("heading", { name: planMessages.planHeading, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(messages.footer, { exact: true })).toBeVisible();
});

test("the trip form has no Confirmation text field", async ({ page }) => {
  await page.goto("#/trip");
  await expect(
    page.getByRole("heading", { name: messages.tripHeading, level: 1 }),
  ).toBeVisible();
  await expect(labeled(page, "Confirmation text")).toHaveCount(0);
});

test("uses a native date picker and a time combobox on desktop", async ({
  page,
}) => {
  await page.goto("#/trip");
  const bedtime = labeled(page, messages.bedtime);
  await expect(bedtime).toHaveAttribute("role", "combobox");
  await expect(bedtime).toHaveAttribute("type", "text");
  await expect(labeled(page, messages.departureDate)).toHaveAttribute(
    "type",
    "date",
  );
  const departureTime = labeled(page, messages.departureTime);
  await expect(departureTime).toHaveAttribute("role", "combobox");
  await expect(departureTime).toHaveAttribute("type", "text");
});

test("shows a field error when arrival is before departure", async ({
  page,
}) => {
  await page.goto("#/trip");
  await expect(
    page.getByRole("combobox", { name: messages.fromAirport }),
  ).toBeEnabled();
  await labeled(page, messages.fromAirport).fill("PRG");
  await page.getByRole("option", { name: /^PRG,/ }).click();
  await labeled(page, messages.toAirport).fill("JFK");
  await page.getByRole("option", { name: /^JFK,/ }).click();
  await labeled(page, messages.departureDate).fill("2027-01-18");
  await labeled(page, messages.departureTime).fill("10:00");
  await labeled(page, messages.arrivalDate).fill("2027-01-18");
  await labeled(page, messages.arrivalTime).fill("03:00");
  await page.getByRole("button", { name: messages.generate }).click();

  const arrival = labeled(page, messages.arrivalTime);
  await expect(arrival).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#field-legs-0-arrivalTime-error")).toHaveText(
    messages.arrivalBeforeDeparture,
  );
  await expect(page).toHaveURL(/#\/trip$/);
});

for (const theme of ["dark", "light"] as const) {
  test(`the trip form has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("#/trip");
    await expect(
      page.getByRole("combobox", { name: messages.fromAirport }),
    ).toBeEnabled();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
