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

// T08 acceptance on the test-only harness (golden fixtures, spec §9.3).

const FIXTURES = [
  "prg-sfo-delay",
  "prg-tyo-advance",
  "prg-syd-antidromic",
  "prg-jfk-meetings",
  "prg-lhr-light-touch",
  "sfo-prg-quick",
  "hel-dec-dark",
  "nyc-lon-dst",
] as const;

const WIDTHS = [390, 1280] as const;
const VISUAL = !!process.env.CI || !!process.env.PW_VISUAL;

async function open(page: Page, fixture: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`phasemap.html?fixture=${fixture}`);
  await expect(page.getByTestId("phase-map")).toBeVisible();
}

/** Bands in the same exclusive lane never overlap, and no label spills out of its band. */
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const exclusive = new Set([
      "SLEEP",
      "SLEEP_INFLIGHT",
      "SEEK_LIGHT",
      "SEEK_LIGHT_ARTIFICIAL",
      "LIGHT_INFLIGHT_WINDOW",
      "AVOID_LIGHT",
    ]);
    for (const row of document.querySelectorAll<SVGGElement>("g[data-date]")) {
      const spans = [...row.querySelectorAll<SVGGElement>("g[data-kind]")]
        .filter((g) => exclusive.has(g.dataset.kind ?? ""))
        .map(
          (g) =>
            [
              Number(g.dataset.startMin),
              Number(g.dataset.endMin),
              g.dataset.kind,
            ] as const,
        )
        .sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < spans.length; i += 1) {
        const prev = spans[i - 1];
        const cur = spans[i];
        if (prev !== undefined && cur !== undefined && cur[0] < prev[1]) {
          problems.push(`${row.dataset.date}: ${prev[2]} overlaps ${cur[2]}`);
        }
      }
      // Flight hatches must be painted under the bands, never over them.
      const firstBand = row.querySelector("g[data-kind]");
      for (const hatch of row.querySelectorAll(
        'rect[role="img"][aria-label^="Flight"]',
      )) {
        if (
          firstBand !== null &&
          firstBand.compareDocumentPosition(hatch) &
            Node.DOCUMENT_POSITION_FOLLOWING
        ) {
          problems.push(`${row.dataset.date}: flight band painted over items`);
        }
      }
      for (const g of row.querySelectorAll<SVGGElement>("g[data-kind]")) {
        const text = g.querySelector("text");
        const band = g.querySelector("rect");
        if (text === null || band === null) continue;
        if (text.getBBox().width > band.getBBox().width) {
          problems.push(
            `${row.dataset.date}: label "${text.textContent}" spills out`,
          );
        }
      }
    }
    return problems;
  });
}

for (const fixture of FIXTURES) {
  for (const width of WIDTHS) {
    test(`${fixture} at ${width}px renders without overlap artifacts`, async ({
      page,
    }) => {
      await open(page, fixture, width);
      expect(await layoutProblems(page)).toEqual([]);
      if (VISUAL) {
        await expect(page.locator("main")).toHaveScreenshot(
          `${fixture}-${width}.png`,
        );
      }
    });

    test(`${fixture} at ${width}px has no axe violations`, async ({ page }) => {
      await open(page, fixture, width);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }

  test(`${fixture}: no horizontal page scroll at 320px`, async ({ page }) => {
    await open(page, fixture, 320);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
}

// Light theme: the same accessibility bar, and two visual baselines.
for (const fixture of FIXTURES) {
  test(`${fixture} in the light theme has no axe violations`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`phasemap.html?fixture=${fixture}&theme=light`);
    await expect(page.getByTestId("phase-map")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

for (const fixture of ["prg-sfo-delay", "nyc-lon-dst"] as const) {
  test(`${fixture} in the light theme at 1280px`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`phasemap.html?fixture=${fixture}&theme=light`);
    await expect(page.getByTestId("phase-map")).toBeVisible();
    expect(await layoutProblems(page)).toEqual([]);
    if (VISUAL) {
      await expect(page.locator("main")).toHaveScreenshot(
        `${fixture}-1280-light.png`,
      );
    }
  });
}

test("DST fixture shows the right wall times on both time scales", async ({
  page,
}) => {
  await open(page, "nyc-lon-dst", 1280);
  const lastSleep = () => page.getByRole("button", { name: /^Sleep, / }).last();
  // Both scales on: the grid reads in destination (London) time.
  await expect(lastSleep()).toHaveAccessibleName("Sleep, 23:00 to 07:00");
  // Destination off: the grid reads in home (New York) time.
  await page.getByRole("button", { name: /^Destination time/ }).click();
  await expect(lastSleep()).toHaveAccessibleName("Sleep, 18:00 to 02:00");
  // The last scale left on cannot be switched off.
  await expect(page.getByRole("button", { name: /^Home time/ })).toBeDisabled();
  await page.getByRole("button", { name: /^Destination time/ }).click();
  await expect(lastSleep()).toHaveAccessibleName("Sleep, 23:00 to 07:00");
});

test("both time scales show by default and can be switched", async ({
  page,
}) => {
  await open(page, "prg-sfo-delay", 1280);
  const dest = page.getByRole("button", {
    name: /^Destination time \(UTC−8\)$/,
  });
  const home = page.getByRole("button", { name: /^Home time \(UTC\+1\)$/ });
  await expect(dest).toHaveAttribute("aria-pressed", "true");
  await expect(home).toHaveAttribute("aria-pressed", "true");
  await home.click();
  await expect(home).toHaveAttribute("aria-pressed", "false");
  await expect(dest).toBeDisabled();
});

test("marks now on today's row when the plan is underway", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  // 2027-01-16 20:30 UTC = 12:30 in San Francisco, inside the plan.
  await page.goto(
    "phasemap.html?fixture=prg-sfo-delay&now=2027-01-16T20:30:00Z",
  );
  const marker = page.getByRole("img", { name: "Now, 12:30" });
  await expect(marker).toHaveCount(1);
  await expect(
    page
      .locator('g[data-date="2027-01-16"]')
      .getByRole("img", { name: "Now, 12:30" }),
  ).toHaveCount(1);
});

test("no now marker before the plan starts", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(
    "phasemap.html?fixture=prg-sfo-delay&now=2026-12-01T12:00:00Z",
  );
  await expect(page.getByTestId("phase-map")).toBeVisible();
  await expect(page.getByRole("img", { name: /^Now, / })).toHaveCount(0);
});

test("keyboard: rows focus, arrows move between items, Enter opens the details", async ({
  page,
}) => {
  await open(page, "prg-tyo-advance", 1280);
  const firstRow = page.locator("g[data-date]").first();
  await firstRow.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("g[data-kind]:focus")).toHaveCount(1);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Why here?")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("g[data-kind]:focus")).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("g[data-date]").nth(1)).toBeFocused();
});

test("reduced motion: rows do not animate", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "prg-sfo-delay", 1280);
  const animation = await page
    .locator("g.pj-row")
    .first()
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe("none");
});
