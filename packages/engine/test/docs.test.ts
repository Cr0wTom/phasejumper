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

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as prc from "../src/prc";

// T05: the constants table in docs/ENGINE.md must match prc.ts exactly —
// every constant documented, nothing extra, same values.

type Value = number | string | readonly number[];

function flatten(value: unknown, path: string, out: Map<string, Value>): void {
  if (
    typeof value === "number" ||
    typeof value === "string" ||
    Array.isArray(value)
  ) {
    out.set(path, value as Value);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, path === "" ? key : `${path}.${key}`, out);
    }
  }
}

/** "2.5 h", "−0.75 h", "[8.5, 11.5] h", "13:00", "−0.35°" → value. */
function parseValue(cell: string): Value {
  const text = cell.replace(/−/g, "-").trim();
  if (/^\d{2}:\d{2}$/.test(text)) return text;
  const range = /^\[(-?[\d.]+), (-?[\d.]+)\]/.exec(text);
  if (range !== null) return [Number(range[1]), Number(range[2])];
  const number = /^(-?[\d.]+)/.exec(text);
  if (number === null) throw new Error(`unparseable value: ${cell}`);
  return Number(number[1]);
}

function documented(): Map<string, Value> {
  const path = fileURLToPath(
    new URL("../../../docs/ENGINE.md", import.meta.url),
  );
  const rows = new Map<string, Value>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\| `([A-Z_][A-Za-z_.]*)` \| ([^|]+) \|/.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) continue;
    expect(rows.has(match[1]), `duplicate row ${match[1]}`).toBe(false);
    rows.set(match[1], parseValue(match[2]));
  }
  return rows;
}

describe("docs/ENGINE.md", () => {
  it("documents every prc.ts constant with its current value, and nothing else", () => {
    const code = new Map<string, Value>();
    flatten(prc, "", code);
    const docs = documented();
    expect([...docs.keys()].sort()).toEqual([...code.keys()].sort());
    for (const [key, value] of code) {
      expect(docs.get(key), key).toEqual(value);
    }
  });
});
