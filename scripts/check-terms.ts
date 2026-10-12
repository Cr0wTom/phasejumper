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
// from scripts/banned-terms.ts. Runs in CI and as the pre-commit hook.
// Usage: node scripts/check-terms.ts

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { thirdPartyPattern } from "./banned-terms.ts";

const pattern = thirdPartyPattern();
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((f) => f !== "" && f !== "scripts/banned-terms.ts");

const hits: string[] = [];
for (const file of files) {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // deleted in the working tree but still in the index
  }
  text.split("\n").forEach((line, i) => {
    if (pattern.test(line)) hits.push(`${file}:${i + 1}`);
  });
}

if (hits.length > 0) {
  process.stderr.write(
    `Third-party names or marks found (see scripts/banned-terms.ts):\n${hits.join("\n")}\n`,
  );
  process.exit(1);
}
