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
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/messages";

const PASTE = readFileSync(
  new URL(
    "../../../packages/itinerary/test/fixtures/lufthansa-labeled.txt",
    import.meta.url,
  ),
  "utf8",
);

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
  // The fields must hold exactly what was typed, whatever the layout.
  await expect(labeled(page, messages.departureDate)).toHaveValue("2027-01-01");
  await expect(labeled(page, messages.departureTime)).toHaveValue("10:00");
  await expect(labeled(page, messages.arrivalTime)).toHaveValue("11:00");
  await tabUntil(page, messages.generate);
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/#\/plan\/[0-9a-f-]{36}$/i);
  await expect(page.getByText(messages.planComingLater)).toBeVisible();
  await expect(page.getByText(messages.footer, { exact: true })).toBeVisible();
});

async function indexedDbText(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const listed = await indexedDB.databases();
    const chunks: string[] = [];
    for (const info of listed) {
      if (info.name === undefined || info.name.length === 0) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(info.name as string);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        for (const storeName of db.objectStoreNames) {
          const values = await new Promise<unknown[]>((resolve, reject) => {
            const tx = db.transaction(storeName, "readonly");
            const request = tx.objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result as unknown[]);
            request.onerror = () => reject(request.error);
          });
          chunks.push(JSON.stringify(values));
        }
      } finally {
        db.close();
      }
    }
    return chunks.join("\n");
  });
}

test("reads a pasted itinerary offline and does not store the text", async ({
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

  await labeled(page, messages.pasteLabel).fill(PASTE);
  await page.getByRole("button", { name: messages.readFlights }).click();

  await expect(labeled(page, messages.pasteLabel)).toHaveValue("");
  await expect(labeled(page, messages.fromAirport)).toHaveValue(/^PRG,/);
  await expect(labeled(page, messages.toAirport)).toHaveValue(/^JFK,/);
  await expect(labeled(page, messages.departureDate)).toHaveValue("2027-01-12");
  await expect(labeled(page, messages.departureTime)).toHaveValue("10:30");
  await expect(labeled(page, messages.arrivalTime)).toHaveValue("13:45");
  await expect(labeled(page, messages.flightNumber)).toHaveValue("LH 1394");
  await expect(page.getByText(messages.pasteUnparsed)).toBeVisible();
  await expect(page.getByText("Leave the hotel by 07:15.")).toBeVisible();
  await expect(page.locator("#field-legs-0-departureTime-review")).toHaveText(
    messages.checkThis,
  );

  await labeled(page, messages.departureTime).fill("10:31");
  await expect(page.locator("#field-legs-0-departureTime-review")).toHaveCount(
    0,
  );
  await expect(page.getByText(messages.checkThis).first()).toBeVisible();

  await page.getByRole("button", { name: messages.generate }).click();
  await expect(page).toHaveURL(/#\/plan\/[0-9a-f-]{36}$/i);
  await expect(page.getByText(messages.planComingLater)).toBeVisible();

  const stored = await indexedDbText(page);
  expect(stored.length).toBeGreaterThan(0);
  expect(stored).toContain("2027-01-12");
  expect(stored).not.toContain(PASTE);
  for (const line of PASTE.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    expect(stored).not.toContain(trimmed);
  }
  expect(foreign).toEqual([]);
});

test("leaves the form unchanged when the paste has no flights", async ({
  page,
}) => {
  await page.goto("#/trip");
  await expect(
    page.getByRole("combobox", { name: messages.fromAirport }),
  ).toBeEnabled();
  await labeled(page, messages.pasteLabel).fill(
    "Hello Alex,\nOur spring sale is open.\n",
  );
  await page.getByRole("button", { name: messages.readFlights }).click();

  await expect(labeled(page, messages.pasteLabel)).toHaveValue("");
  await expect(page.getByRole("alert")).toHaveText(messages.pasteUnread);
  await expect(labeled(page, messages.fromAirport)).toHaveValue("");
  await expect(labeled(page, messages.departureDate)).toHaveValue("");
  await expect(page).toHaveURL(/#\/trip$/);
});

test("uses native date and time pickers", async ({ page }) => {
  await page.goto("#/trip");
  await expect(labeled(page, messages.bedtime)).toHaveAttribute("type", "time");
  await expect(labeled(page, messages.departureDate)).toHaveAttribute(
    "type",
    "date",
  );
  await expect(labeled(page, messages.departureTime)).toHaveAttribute(
    "type",
    "time",
  );
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
