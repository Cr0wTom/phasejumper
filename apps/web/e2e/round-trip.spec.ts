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
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  messages,
  planMessages,
  returnMessages,
  startMessages,
} from "../src/messages";
import { preAcceptTerms } from "./acceptTerms";

test.beforeEach(async ({ page }) => {
  await preAcceptTerms(page);
});

interface LegInput {
  from: string;
  to: string;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
}

const OUTBOUND: LegInput = {
  from: "PRG",
  to: "SFO",
  departureDate: "2027-01-15",
  departureTime: "10:30",
  arrivalDate: "2027-01-15",
  arrivalTime: "13:05",
};

function homeLeg(departureDate: string, arrivalDate: string): LegInput {
  return {
    from: "SFO",
    to: "PRG",
    departureDate,
    departureTime: "15:00",
    arrivalDate,
    arrivalTime: "11:30",
  };
}

async function openTrip(page: Page): Promise<void> {
  await page.goto("#/trip");
  await expect(
    page.getByRole("combobox", { name: messages.fromAirport }),
  ).toBeEnabled();
}

async function fillLeg(
  page: Page,
  scope: Locator,
  index: number,
  leg: LegInput,
): Promise<void> {
  const from = scope
    .getByRole("combobox", { name: messages.fromAirport })
    .nth(index);
  await from.fill(leg.from);
  await page.getByRole("option", { name: new RegExp(`^${leg.from},`) }).click();
  const to = scope
    .getByRole("combobox", { name: messages.toAirport })
    .nth(index);
  await to.fill(leg.to);
  await page.getByRole("option", { name: new RegExp(`^${leg.to},`) }).click();
  await scope
    .getByLabel(messages.departureDate, { exact: true })
    .nth(index)
    .fill(leg.departureDate);
  await scope
    .getByLabel(messages.departureTime, { exact: true })
    .nth(index)
    .fill(leg.departureTime);
  await scope
    .getByLabel(messages.arrivalDate, { exact: true })
    .nth(index)
    .fill(leg.arrivalDate);
  await scope
    .getByLabel(messages.arrivalTime, { exact: true })
    .nth(index)
    .fill(leg.arrivalTime);
}

async function generate(page: Page): Promise<void> {
  await page.getByRole("button", { name: messages.generate }).click();
  await expect(page).toHaveURL(/#\/plan\/[0-9a-f-]{36}$/i);
  // The title is the trip name when one was given, else "Your plan".
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function planCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("keyval-store");
      request.onerror = () => {
        reject(request.error ?? new Error("IndexedDB"));
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
    });
    try {
      const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const request = db
          .transaction("keyval", "readonly")
          .objectStore("keyval")
          .getAllKeys();
        request.onerror = () => {
          reject(request.error ?? new Error("IndexedDB"));
        };
        request.onsuccess = () => {
          resolve(request.result);
        };
      });
      return keys.filter(
        (key) => typeof key === "string" && key.startsWith("plan:"),
      ).length;
    } finally {
      db.close();
    }
  });
}

/** Outbound and Return both open, the return shifts the clock, Start lists one trip. */
async function expectRoundTrip(page: Page): Promise<void> {
  const group = page.getByRole("group", { name: returnMessages.partsLabel });
  const outbound = group.getByRole("button", { name: returnMessages.outbound });
  const returning = group.getByRole("button", { name: returnMessages.return });
  await expect(outbound).toHaveAttribute("aria-pressed", "true");
  await expect(returning).toHaveAttribute("aria-pressed", "false");
  const outboundUrl = page.url();
  await returning.click();
  await expect(page).not.toHaveURL(outboundUrl);
  await expect(returning).toHaveAttribute("aria-pressed", "true");
  await expect(outbound).toHaveAttribute("aria-pressed", "false");
  const explanation = page.locator("header p.text-17");
  await expect(explanation).toContainText(/\d+(?:\.\d+)? h/);
  await expect(explanation).not.toContainText(/\b0 h\b/);
  await outbound.click();
  await expect(page).toHaveURL(outboundUrl);
  await expect(outbound).toHaveAttribute("aria-pressed", "true");
  expect(await planCount(page)).toBe(2);

  await page.goto("#/");
  const saved = page.getByRole("region", { name: startMessages.savedHeading });
  await expect(saved.getByRole("link")).toHaveCount(1);
  await expect(saved.getByRole("link")).toContainText("PRG to SFO and back");
}

test("plans the way home as a second plan", async ({ page }) => {
  await openTrip(page);
  const flights = page.getByRole("region", { name: messages.flightsHeading });
  await fillLeg(page, flights, 0, OUTBOUND);
  await page.getByRole("button", { name: returnMessages.add }).click();
  const returning = page.getByRole("region", { name: returnMessages.heading });
  await expect(
    returning.getByRole("heading", { name: returnMessages.heading, level: 2 }),
  ).toBeVisible();
  await fillLeg(page, returning, 0, homeLeg("2027-01-23", "2027-01-24"));
  await expect(
    page.getByText(returnMessages.tripDaysFromFlights(8)),
  ).toBeVisible();
  await expect(page.getByLabel(messages.tripDays)).toHaveCount(0);
  await generate(page);
  await expectRoundTrip(page);
});

test("a two-day stay saves one plan and says the stay is short", async ({
  page,
}) => {
  await openTrip(page);
  const flights = page.getByRole("region", { name: messages.flightsHeading });
  await fillLeg(page, flights, 0, OUTBOUND);
  await page.getByRole("button", { name: returnMessages.add }).click();
  const returning = page.getByRole("region", { name: returnMessages.heading });
  await fillLeg(page, returning, 0, homeLeg("2027-01-17", "2027-01-18"));
  await expect(
    page.getByText(returnMessages.tripDaysFromFlights(2)),
  ).toBeVisible();
  await generate(page);
  await expect(
    page.getByRole("status").filter({ hasText: returnMessages.shortStay }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: returnMessages.partsLabel }),
  ).toHaveCount(0);
  expect(await planCount(page)).toBe(1);
});

test("moving a detected return out of the outbound list plans both halves", async ({
  page,
}) => {
  await openTrip(page);
  const flights = page.getByRole("region", { name: messages.flightsHeading });
  for (let extra = 0; extra < 3; extra += 1) {
    await page.getByRole("button", { name: messages.addLeg }).click();
  }
  const legs: LegInput[] = [
    {
      from: "PRG",
      to: "FRA",
      departureDate: "2027-01-15",
      departureTime: "08:00",
      arrivalDate: "2027-01-15",
      arrivalTime: "09:05",
    },
    {
      from: "FRA",
      to: "SFO",
      departureDate: "2027-01-15",
      departureTime: "11:30",
      arrivalDate: "2027-01-15",
      arrivalTime: "14:00",
    },
    {
      from: "SFO",
      to: "FRA",
      departureDate: "2027-01-23",
      departureTime: "15:30",
      arrivalDate: "2027-01-24",
      arrivalTime: "11:00",
    },
    {
      from: "FRA",
      to: "PRG",
      departureDate: "2027-01-24",
      departureTime: "13:30",
      arrivalDate: "2027-01-24",
      arrivalTime: "14:40",
    },
  ];
  for (let index = 0; index < legs.length; index += 1) {
    const leg = legs[index];
    if (leg === undefined) throw new Error("missing leg");
    await fillLeg(page, flights, index, leg);
  }
  await expect(
    page.getByRole("status").filter({ hasText: returnMessages.detected }),
  ).toBeVisible();
  await page.getByRole("button", { name: returnMessages.moveToReturn }).click();
  const returning = page.getByRole("region", { name: returnMessages.heading });
  await expect(
    returning.getByRole("heading", { name: returnMessages.legHeading(1) }),
  ).toBeVisible();
  await expect(
    returning.getByRole("heading", { name: returnMessages.legHeading(2) }),
  ).toBeVisible();
  await expect(
    returning.getByRole("combobox", { name: messages.fromAirport }).first(),
  ).toHaveValue(/^SFO,/);
  await expect(
    page.getByText(returnMessages.tripDaysFromFlights(8)),
  ).toBeVisible();
  await generate(page);
  await expectRoundTrip(page);
});

for (const theme of ["dark", "light"] as const) {
  test(`the trip form with return flights has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await openTrip(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.getByRole("button", { name: returnMessages.add }).click();
    await expect(
      page.getByRole("heading", { name: returnMessages.heading, level: 2 }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test(`a linked plan page has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await openTrip(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const flights = page.getByRole("region", { name: messages.flightsHeading });
    await fillLeg(page, flights, 0, OUTBOUND);
    await page.getByRole("button", { name: returnMessages.add }).click();
    await fillLeg(
      page,
      page.getByRole("region", { name: returnMessages.heading }),
      0,
      homeLeg("2027-01-23", "2027-01-24"),
    );
    await generate(page);
    await expect(
      page.getByRole("group", { name: returnMessages.partsLabel }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

test("a trip name titles both halves and the list, never the share link", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openTrip(page);
  await page
    .getByLabel(messages.tripName, { exact: true })
    .fill("Seoul conference");
  const flights = page.getByRole("region", { name: messages.flightsHeading });
  await fillLeg(page, flights, 0, OUTBOUND);
  await page.getByRole("button", { name: returnMessages.add }).click();
  const returning = page.getByRole("region", { name: returnMessages.heading });
  await fillLeg(page, returning, 0, homeLeg("2027-01-23", "2027-01-24"));
  await generate(page);
  await expect(
    page.getByRole("heading", { name: "Seoul conference", level: 1 }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: returnMessages.partsLabel })
    .getByRole("button", { name: returnMessages.return })
    .click();
  await expect(
    page.getByRole("heading", { name: "Seoul conference", level: 1 }),
  ).toBeVisible();

  await page.getByRole("button", { name: planMessages.share }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const payload = link.split("#p=")[1] ?? "";
  expect(Buffer.from(payload, "base64url").toString("utf8")).not.toContain(
    "Seoul",
  );

  await page.goto("#/");
  await expect(page.getByText("Seoul conference")).toHaveCount(1);
  await expect(page.getByText(/PRG to SFO and back/)).toBeVisible();
});
