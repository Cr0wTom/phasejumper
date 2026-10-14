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
import {
  calendarImportMessages,
  messages,
  returnMessages,
} from "../src/messages";
import { preAcceptTerms } from "./acceptTerms";

test.beforeEach(async ({ page }) => {
  await preAcceptTerms(page);
});

/** Later leg first, so the card's order is the departure order. */
const TWO_LEGS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "SUMMARY:FRA to SFO",
  "DTSTART;TZID=Europe/Berlin:20270115T140000",
  "DTEND;TZID=America/Los_Angeles:20270115T160000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "SUMMARY:PRG to FRA LH 455",
  "DTSTART;TZID=Europe/Prague:20270115T083000",
  "DTEND;TZID=Europe/Berlin:20270115T093000",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

const KEPT = calendarImportMessages.row("PRG", "FRA", "2027-01-15 08:30");
const DROPPED = calendarImportMessages.row("FRA", "SFO", "2027-01-15 14:00");

async function openTrip(page: Page): Promise<void> {
  await page.goto("#/trip");
  await expect(
    page.getByRole("combobox", { name: messages.fromAirport }),
  ).toBeEnabled();
  await expect(page.getByLabel(calendarImportMessages.button)).toBeEnabled();
}

async function upload(
  page: Page,
  contents: string,
  name = "trip.ics",
): Promise<void> {
  await page.getByLabel(calendarImportMessages.button).setInputFiles({
    name,
    mimeType: "text/calendar",
    buffer: Buffer.from(contents),
  });
}

async function sideways(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

test("adding the ticked flight replaces the outbound leg", async ({ page }) => {
  await openTrip(page);
  await page.getByLabel(messages.tripName, { exact: true }).fill("Lisbon week");
  await page.getByRole("button", { name: messages.generate }).click();
  await expect(page.getByText(messages.fieldSummary)).toBeVisible();

  await upload(page, TWO_LEGS);
  await expect(
    page.getByRole("heading", {
      name: calendarImportMessages.found(2),
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(calendarImportMessages.foundHint, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: KEPT, exact: true }),
  ).toBeChecked();
  await page.getByRole("checkbox", { name: DROPPED, exact: true }).uncheck();
  await page.getByRole("button", { name: calendarImportMessages.add }).click();

  await expect(
    page.getByRole("heading", { name: calendarImportMessages.found(2) }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: messages.flightLegend(1) }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: messages.flightLegend(2) }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: messages.fromAirport, exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("combobox", { name: messages.fromAirport, exact: true }),
  ).toHaveValue(/^PRG,/);
  await expect(
    page.getByRole("combobox", { name: messages.toAirport, exact: true }),
  ).toHaveValue(/^FRA,/);
  await expect(
    page.getByLabel(messages.departureDate, { exact: true }),
  ).toHaveValue("2027-01-15");
  await expect(
    page.getByLabel(messages.departureTime, { exact: true }),
  ).toHaveValue("08:30");
  await expect(
    page.getByLabel(messages.arrivalDate, { exact: true }),
  ).toHaveValue("2027-01-15");
  await expect(
    page.getByLabel(messages.arrivalTime, { exact: true }),
  ).toHaveValue("09:30");
  await expect(
    page.getByLabel(messages.flightNumber, { exact: true }),
  ).toHaveValue("LH455");
  await expect(page.getByLabel(messages.tripName, { exact: true })).toHaveValue(
    "Lisbon week",
  );
  await expect(page.getByLabel(messages.bedtime, { exact: true })).toHaveValue(
    "23:00",
  );
  await expect(
    page.getByRole("button", { name: returnMessages.add }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: returnMessages.heading }),
  ).toHaveCount(0);
  await expect(page.getByText(messages.fieldSummary)).toHaveCount(0);
  await expect(page.getByText(messages.chooseAirport)).toHaveCount(0);
});

test("a file that is not a calendar shows an alert", async ({ page }) => {
  await openTrip(page);
  await upload(page, "hello from a notes file", "notes.txt");
  await expect(page.getByRole("alert")).toHaveText(
    calendarImportMessages.notCalendar,
  );
  await expect(page.getByText(calendarImportMessages.foundHint)).toHaveCount(0);
});

test("cancel closes the card and leaves the form as it was", async ({
  page,
}) => {
  await openTrip(page);
  await page.getByLabel(messages.tripName, { exact: true }).fill("Lisbon week");
  await upload(page, TWO_LEGS);
  await expect(
    page.getByRole("heading", {
      name: calendarImportMessages.found(2),
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: DROPPED, exact: true }).uncheck();
  await page
    .getByRole("button", { name: calendarImportMessages.cancel, exact: true })
    .click();

  await expect(
    page.getByRole("heading", { name: calendarImportMessages.found(2) }),
  ).toHaveCount(0);
  await expect(page.getByLabel(messages.tripName, { exact: true })).toHaveValue(
    "Lisbon week",
  );
  await expect(
    page.getByRole("combobox", { name: messages.fromAirport }),
  ).toHaveValue("");
  await expect(
    page.getByLabel(messages.departureDate, { exact: true }),
  ).toHaveValue("");
  await expect(page.getByLabel(messages.bedtime, { exact: true })).toHaveValue(
    "23:00",
  );
});

for (const theme of ["dark", "light"] as const) {
  test(`the found-flights card has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await openTrip(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await upload(page, TWO_LEGS);
    await expect(
      page.getByRole("heading", {
        name: calendarImportMessages.found(2),
        exact: true,
      }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

test("the trip form does not scroll sideways at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTrip(page);
  expect(await sideways(page)).toBe(0);
  await upload(page, TWO_LEGS);
  await expect(
    page.getByRole("heading", {
      name: calendarImportMessages.found(2),
      exact: true,
    }),
  ).toBeVisible();
  expect(await sideways(page)).toBe(0);
});
