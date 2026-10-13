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

// Fails when any tracked (or staged) file mentions a third-party name or mark
// from scripts/banned-terms.ts, or when user-facing copy contains a banned
// health word that is not allow-listed. Runs in CI and as the pre-commit hook.
// Usage: node scripts/check-terms.ts

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HEALTH_TERMS,
  THIRD_PARTY_TERMS,
  USER_FACING_FILES,
  scanUserFacingCopy,
  thirdPartyPattern,
  type AllowEntry,
} from "./banned-terms.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message: string): never {
  process.stderr.write(message);
  process.exit(1);
}

const pattern = thirdPartyPattern();
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((f) => f !== "" && f !== "scripts/banned-terms.ts");

const thirdPartyHits: string[] = [];
for (const file of files) {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // deleted in the working tree but still in the index
  }
  text.split("\n").forEach((line, i) => {
    if (pattern.test(line)) thirdPartyHits.push(`${file}:${i + 1}`);
  });
}

if (thirdPartyHits.length > 0) {
  fail(
    `Third-party names or marks found (see scripts/banned-terms.ts):\n${thirdPartyHits.join("\n")}\n`,
  );
}

function isAllowEntry(value: unknown): value is AllowEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.file === "string" &&
    typeof entry.contains === "string" &&
    typeof entry.term === "string" &&
    typeof entry.justification === "string"
  );
}

const allowRaw: unknown = JSON.parse(
  readFileSync(join(root, "scripts/banned-terms-allow.json"), "utf8"),
);
if (!Array.isArray(allowRaw) || !allowRaw.every(isAllowEntry)) {
  fail("scripts/banned-terms-allow.json must be an array of allow entries.\n");
}

const docs = readdirSync(join(root, "docs"))
  .filter((name) => name.endsWith(".md"))
  .map((name) => `docs/${name}`)
  .sort();
const copyFiles = [...USER_FACING_FILES, ...docs];
const scanned = copyFiles.map((file) => ({
  file,
  text: readFileSync(join(root, file), "utf8"),
}));

const result = scanUserFacingCopy(
  scanned,
  HEALTH_TERMS,
  THIRD_PARTY_TERMS,
  allowRaw,
);

if (result.hits.length > 0) {
  const lines = result.hits.map((hit) =>
    hit.term === "(third-party)"
      ? `${hit.file}:${hit.line}`
      : `${hit.file}:${hit.line}:${hit.term}`,
  );
  fail(`Banned words in user-facing copy:\n${lines.join("\n")}\n`);
}

if (result.unusedAllow.length > 0) {
  const lines = result.unusedAllow.map(
    (entry) => `${entry.file} term=${entry.term}`,
  );
  fail(`Unused banned-terms allow-list entries:\n${lines.join("\n")}\n`);
}
