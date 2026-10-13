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

import { expect, test, type Download, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { planMessages } from "../src/messages";
import { preAcceptTerms } from "./acceptTerms";

test.beforeEach(async ({ page }) => {
  await preAcceptTerms(page);
});

// T10: the plan screen downloads a calendar file and bumps SEQUENCE.

const SFO = readFileSync(
  new URL(
    "../../../packages/engine/test/fixtures/prg-sfo-delay.input.json",
    import.meta.url,
  ),
  "utf8",
);
const SHARE = `#p=${Buffer.from(JSON.stringify(JSON.parse(SFO))).toString("base64url")}`;

async function openShared(page: Page): Promise<string> {
  await page.goto(SHARE);
  await expect(page).toHaveURL(/#\/plan\/[0-9a-f-]{36}$/i);
  await expect(
    page.getByRole("heading", { name: planMessages.planHeading, level: 1 }),
  ).toBeVisible();
  return decodeURIComponent(page.url().split("#/plan/")[1] ?? "");
}

async function textOf(download: Download): Promise<string> {
  const path = await download.path();
  if (path === null) throw new Error("The download has no file.");
  return readFile(path, "utf8");
}

function sequences(ics: string): number[] {
  const unfolded = ics.replace(/\r\n[ \t]/g, "");
  return [...unfolded.matchAll(/^SEQUENCE:(\d+)/gm)].map((match) =>
    Number(match[1]),
  );
}

test("downloads a calendar file and a second download has a higher SEQUENCE", async ({
  page,
}) => {
  const id = await openShared(page);
  const button = page.getByRole("button", {
    name: planMessages.downloadCalendar,
  });

  const firstDownload = page.waitForEvent("download");
  await button.click();
  const first = await firstDownload;
  expect(first.suggestedFilename()).toBe("phasejumper-prg-sfo.ics");
  const firstText = await textOf(first);
  expect(firstText).toContain("BEGIN:VCALENDAR");
  const firstSequence = Math.max(...sequences(firstText));

  const secondDownload = page.waitForEvent("download");
  await button.click();
  const second = await secondDownload;
  expect(second.suggestedFilename()).toBe("phasejumper-prg-sfo.ics");
  const secondText = await textOf(second);
  expect(secondText).toContain("BEGIN:VCALENDAR");
  expect(Math.max(...sequences(secondText))).toBeGreaterThan(firstSequence);

  await expect
    .poll(async () =>
      page.evaluate(
        (key) =>
          new Promise<number | undefined>((resolve, reject) => {
            const open = indexedDB.open("keyval-store");
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const get = open.result
                .transaction("keyval")
                .objectStore("keyval")
                .get(key);
              get.onerror = () => reject(get.error);
              get.onsuccess = () => {
                const value: unknown = get.result;
                if (
                  typeof value === "object" &&
                  value !== null &&
                  "icsSequence" in value &&
                  typeof value.icsSequence === "number"
                ) {
                  resolve(value.icsSequence);
                  return;
                }
                resolve(undefined);
              };
            };
          }),
        `plan:${id}`,
      ),
    )
    .toBe(2);
});
