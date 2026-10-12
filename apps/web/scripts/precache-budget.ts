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

import { statSync } from "node:fs";
import { join } from "node:path";

/** 3 MiB. Workbox's byte limit uses the same unit. */
export const PRECACHE_BUDGET_BYTES = 3 * 1024 * 1024;

// Workbox entries are `{ url, revision }` objects. Match only those pairs so
// strings inside the Workbox runtime are not treated as precache files.
const URL_THEN_REVISION =
  /(?:"url"|[{,]\s*url)\s*:\s*"([^"]+)"\s*,\s*(?:"revision"|revision)\s*:/g;
const REVISION_THEN_URL =
  /(?:"revision"|revision)\s*:\s*(?:"[^"]*"|null)\s*,\s*(?:"url"|url)\s*:\s*"([^"]+)"/g;

export function precacheUrls(serviceWorker: string): string[] {
  const urls = new Set<string>();
  for (const match of serviceWorker.matchAll(URL_THEN_REVISION)) {
    if (match[1] !== undefined) urls.add(match[1]);
  }
  for (const match of serviceWorker.matchAll(REVISION_THEN_URL)) {
    if (match[1] !== undefined) urls.add(match[1]);
  }
  return [...urls];
}

function fileForUrl(url: string, distDir: string, base: string): string {
  const clean = url.split("?")[0]?.split("#")[0] ?? url;
  let path = decodeURIComponent(clean);
  if (base !== "/" && path.startsWith(base)) path = path.slice(base.length);
  if (path.startsWith("/")) path = path.slice(1);
  if (path.startsWith("./")) path = path.slice(2);
  return join(distDir, path);
}

/** Sum of unique precache files. Throws if the manifest is empty or a file is missing. */
export function precacheTotalBytes(
  serviceWorker: string,
  distDir: string,
  base = "/phasejumper/",
): number {
  const urls = precacheUrls(serviceWorker);
  if (urls.length === 0) {
    throw new Error("The service worker precache manifest is empty.");
  }
  let total = 0;
  for (const url of urls) {
    const file = fileForUrl(url, distDir, base);
    try {
      total += statSync(file).size;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Precache entry ${url} is not in ${distDir} (${reason}).`,
        { cause: error },
      );
    }
  }
  return total;
}
