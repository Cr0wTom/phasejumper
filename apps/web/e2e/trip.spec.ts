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

import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/messages";

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
    page.getByRole("region", { name: messages.planSummary }),
  ).not.toHaveText("");
  await expect(page.getByText(messages.planComingLater)).toBeVisible();
  await expect(page.getByText(/^\d+ days? in this plan\.$/)).toBeVisible();
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
  await page.keyboard.type("2027-01-18");
  await tabUntil(page, messages.departureTime);
  await page.keyboard.type("10:00");
  await tabUntil(page, messages.arrivalDate);
  await page.keyboard.type("2027-01-18");
  await tabUntil(page, messages.arrivalTime);
  await page.keyboard.type("13:00");
  await tabUntil(page, messages.generate);
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/#\/plan\/[0-9a-f-]{36}$/i);
  await expect(page.getByText(messages.planComingLater)).toBeVisible();
  await expect(page.getByText(messages.footer, { exact: true })).toBeVisible();
});

test("shows a field error for an invalid time", async ({ page }) => {
  await page.goto("#/trip");
  await expect(
    page.getByRole("heading", { name: messages.tripHeading }),
  ).toBeVisible();
  await labeled(page, messages.bedtime).fill("25:99");
  await page.getByRole("button", { name: messages.generate }).click();

  const bedtime = labeled(page, messages.bedtime);
  await expect(bedtime).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#field-habitualBedtime-error")).toHaveText(
    messages.timeInvalid,
  );
  await expect(page).toHaveURL(/#\/trip$/);
});
