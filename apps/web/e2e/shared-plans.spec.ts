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
import { readFileSync } from "node:fs";
import { sharedMessages as s, startMessages } from "../src/messages";
import { preAcceptTerms } from "./acceptTerms";

// Privacy: opening someone's share link never adds their trip to "your"
// plans. It is shown, not saved; saving is explicit and listed apart; any
// saved plan can be deleted on its own.

const SFO = readFileSync(
  new URL(
    "../../../packages/engine/test/fixtures/prg-sfo-delay.input.json",
    import.meta.url,
  ),
  "utf8",
);
const SHARE = `#p=${Buffer.from(JSON.stringify(JSON.parse(SFO))).toString("base64url")}`;

async function savedKeys(page: Page): Promise<string[]> {
  return page.evaluate(async () =>
    // Never create the database here: that would break the app's own open.
    (await indexedDB.databases()).some((d) => d.name === "keyval-store")
      ? await new Promise<string[]>((resolve, reject) => {
          const open = indexedDB.open("keyval-store");
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            if (!open.result.objectStoreNames.contains("keyval")) {
              resolve([]);
              return;
            }
            const req = open.result
              .transaction("keyval")
              .objectStore("keyval")
              .getAllKeys();
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result.map(String));
          };
        })
      : [],
  );
}

test.beforeEach(async ({ page }) => {
  await preAcceptTerms(page);
});

test("opening a share link shows the plan and saves nothing", async ({
  page,
}) => {
  await page.goto(SHARE);
  await expect(page.getByText(s.label, { exact: true })).toBeVisible();
  await expect(page.getByText(s.notice)).toBeVisible();
  await expect(page.getByTestId("phase-map")).toBeVisible();
  await page.reload();
  await expect(page.getByText(s.notice)).toBeVisible();
  expect(await savedKeys(page)).toEqual([]);
  await page.goto("#/");
  await expect(page.getByText(startMessages.savedNone)).toBeVisible();
});

test("a saved shared plan is listed apart and can be deleted", async ({
  page,
}) => {
  await page.goto(SHARE);
  await page.getByRole("button", { name: s.save }).click();
  await expect(page).toHaveURL(/#\/plan\/[0-9a-f-]{36}$/i);
  await page.goto("#/");
  await expect(
    page.getByRole("heading", { name: s.sharedWithYou }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: s.yourTrips })).toHaveCount(0);

  const remove = page.getByRole("button", { name: /^Delete / });
  await remove.click();
  await expect(page.getByText(s.deleteConfirm)).toBeVisible();
  await page.getByRole("button", { name: s.deleteCancel }).click();
  expect(
    (await savedKeys(page)).filter((k) => k.startsWith("plan:")),
  ).toHaveLength(1);

  await remove.click();
  await page.getByRole("button", { name: s.deleteYes, exact: true }).click();
  await expect(page.getByText(startMessages.savedNone)).toBeVisible();
  expect((await savedKeys(page)).filter((k) => k.startsWith("plan:"))).toEqual(
    [],
  );
  expect(await savedKeys(page)).not.toContain("meta:lastPlan");
});
