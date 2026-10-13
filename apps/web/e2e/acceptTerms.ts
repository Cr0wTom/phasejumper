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

import type { BrowserContext, Page } from "@playwright/test";
import { TERMS_STORAGE_KEY, TERMS_VERSION } from "../src/terms";

const RECORD = {
  acceptedTermsVersion: TERMS_VERSION,
  at: "2026-01-01T00:00:00.000Z",
};

/** Writes the current terms acceptance before the page loads. */
export async function preAcceptTerms(
  target: Page | BrowserContext,
): Promise<void> {
  await target.addInitScript(
    ({ key, record }) => {
      localStorage.setItem(key, JSON.stringify(record));
    },
    { key: TERMS_STORAGE_KEY, record: RECORD },
  );
}
