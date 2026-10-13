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

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  legalMessages,
  messages,
  planMessages,
  sharedMessages,
} from "../src/messages";
import { TERMS_STORAGE_KEY } from "../src/terms";
import { preAcceptTerms } from "./acceptTerms";

const SFO = readFileSync(
  new URL(
    "../../../packages/engine/test/fixtures/prg-sfo-delay.input.json",
    import.meta.url,
  ),
  "utf8",
);
const SHARE = `#p=${Buffer.from(JSON.stringify(JSON.parse(SFO))).toString("base64url")}`;

async function planKeys(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const listed = await indexedDB.databases();
    if (!listed.some((info) => info.name === "keyval-store")) return [];
    return new Promise<string[]>((resolve, reject) => {
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
        req.onsuccess = () =>
          resolve(
            req.result.map(String).filter((key) => key.startsWith("plan:")),
          );
      };
    });
  });
}

async function acceptGate(page: Page): Promise<void> {
  await page.getByLabel(legalMessages.acceptWellness, { exact: true }).check();
  await page.getByLabel(legalMessages.acceptAge, { exact: true }).check();
  await page.getByRole("button", { name: legalMessages.continue }).click();
}

test("a fresh browser cannot reach Generate plan without accepting", async ({
  page,
}) => {
  await page.goto("#/trip");
  await expect(
    page.getByRole("heading", { name: legalMessages.heading }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: messages.generate }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: legalMessages.continue }).click();
  await expect(page.getByRole("alert")).toHaveText(legalMessages.needBoth);
  await expect(
    page.getByRole("button", { name: messages.generate }),
  ).toHaveCount(0);

  await page.getByLabel(legalMessages.acceptWellness, { exact: true }).check();
  await page.getByRole("button", { name: legalMessages.continue }).click();
  await expect(page.getByRole("alert")).toHaveText(legalMessages.needBoth);
  await expect(
    page.getByRole("button", { name: messages.generate }),
  ).toHaveCount(0);

  await acceptGate(page);
  await expect(
    page.getByRole("button", { name: messages.generate }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("button", { name: messages.generate }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: legalMessages.heading }),
  ).toHaveCount(0);
});

test("an older stored terms version re-prompts", async ({ page }) => {
  await page.addInitScript(
    ({ key }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          acceptedTermsVersion: 0,
          at: "2020-01-01T00:00:00.000Z",
        }),
      );
    },
    { key: TERMS_STORAGE_KEY },
  );
  await page.goto("#/trip");
  await expect(
    page.getByRole("heading", { name: legalMessages.updatedHeading }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: messages.generate }),
  ).toHaveCount(0);
});

test("a share link waits for the gate and saves nothing until accepting", async ({
  page,
}) => {
  await page.goto(SHARE);
  await expect(
    page.getByRole("heading", { name: legalMessages.heading }),
  ).toBeVisible();
  expect(await planKeys(page)).toEqual([]);

  await acceptGate(page);
  // Accepting shows the shared plan; it is still not saved.
  await expect(page.getByText(sharedMessages.notice)).toBeVisible();
  expect(await planKeys(page)).toEqual([]);
  await page.getByRole("button", { name: sharedMessages.save }).click();
  await expect(page).toHaveURL(/#\/plan\/[0-9a-f-]{36}$/i);
  expect((await planKeys(page)).length).toBe(1);
});

test("#/legal renders both documents", async ({ page }) => {
  await page.goto("#/legal");
  await expect(
    page.getByRole("heading", { name: legalMessages.pageHeading, level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Terms of use" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Privacy notice" }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: planMessages.nav.label });
  await expect(
    nav.getByRole("link", { name: planMessages.nav.settings }),
  ).toHaveAttribute("aria-current", "page");
});

test("the melatonin checklist blocks timing windows", async ({ page }) => {
  await preAcceptTerms(page);
  await page.goto("#/trip");
  await page
    .getByLabel(legalMessages.melatoninQuestion, { exact: true })
    .check();
  await expect(page.getByText(legalMessages.melatoninNotice)).toBeVisible();
  await page
    .getByLabel(legalMessages.melatoninPregnant, { exact: true })
    .check();
  await expect(page.getByRole("status")).toHaveText(
    legalMessages.melatoninBlocked,
  );
});

test("the technical report copies the six keys and no airport code", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await preAcceptTerms(page);
  await page.goto(SHARE);
  await page.getByRole("button", { name: sharedMessages.save }).click();
  await expect(page).toHaveURL(/#\/plan\/[0-9a-f-]{36}$/i);
  await page.goto("#/settings");
  await page.getByRole("button", { name: legalMessages.reportButton }).click();
  await expect(page.getByRole("status")).toHaveText(legalMessages.reportCopied);
  const text = await page.evaluate(() => navigator.clipboard.readText());
  const report = JSON.parse(text) as Record<string, unknown>;
  expect(Object.keys(report).sort()).toEqual(
    [
      "appVersion",
      "engineVersion",
      "flags",
      "hashedInputDigest",
      "userAgent",
      "warnings",
    ].sort(),
  );
  expect(text).not.toMatch(/\bPRG\b/);
  expect(text).not.toMatch(/\bSFO\b/);
  const digest = createHash("sha256")
    .update(JSON.stringify(JSON.parse(SFO)))
    .digest("hex");
  expect(report.hashedInputDigest).toBe(digest);
  expect(Array.isArray(report.warnings)).toBe(true);
});

for (const theme of ["dark", "light"] as const) {
  test(`the acceptance gate has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("#/trip");
    await expect(
      page.getByRole("heading", { name: legalMessages.heading }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test(`#/legal has no axe violations in the ${theme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("#/legal");
    await expect(
      page.getByRole("heading", { name: legalMessages.pageHeading, level: 1 }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
