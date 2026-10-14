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

// Every form control renders the same box as a text input, in Chromium and
// in WebKit (Safari, every iOS browser), which otherwise sizes native date,
// time and select controls differently.

test("text, date, time and select controls share one box size", async ({
  page,
}) => {
  // Phone width (the WebKit project is already an iPhone): one column.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("#/trip");
  await expect(
    page.getByRole("combobox", { name: "From", exact: true }),
  ).toBeEnabled();
  const boxes = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        // File pickers are buttons, not text boxes; they are not compared.
        "main input:not([type=checkbox]):not([type=file]), main select",
      ),
    ]
      .filter((el) => el.offsetParent !== null)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          kind:
            el instanceof HTMLSelectElement
              ? "select"
              : (el as HTMLInputElement).type,
          height: Math.round(r.height),
          width: Math.round(r.width),
          left: Math.round(r.left),
          padding: getComputedStyle(el).paddingLeft,
        };
      }),
  );
  const kinds = new Set(boxes.map((b) => b.kind));
  for (const kind of ["text", "date", "select"]) expect(kinds).toContain(kind);
  // Phones keep a native time input. Desktop (fine pointer) uses a text combobox.
  const coarse = await page.evaluate(
    () => window.matchMedia("(pointer: coarse)").matches,
  );
  if (coarse) expect(kinds).toContain("time");
  else expect(kinds.has("time")).toBe(false);
  const reference = boxes.find((b) => b.kind === "text");
  expect(reference).toBeDefined();
  for (const box of boxes) {
    expect(box.height, box.kind).toBe(reference?.height);
    expect(box.padding, box.kind).toBe(reference?.padding);
  }
  // On a phone the form is one column: every control shares one edge and width.
  expect(new Set(boxes.map((b) => b.left)).size).toBe(1);
  expect(new Set(boxes.map((b) => b.width)).size).toBe(1);
});
