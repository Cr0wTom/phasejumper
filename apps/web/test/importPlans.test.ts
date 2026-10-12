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

import { describe, expect, it } from "vitest";
import { MAX_IMPORT_BYTES, parseImport } from "../src/storage/importPlans";
import { backupOf, type StoredPlan } from "../src/storage/plans";
import { EXAMPLE_TRIP } from "../src/exampleTrip";
import prgSfo from "../../../packages/engine/test/fixtures/prg-sfo-delay.input.json";
import prgTyo from "../../../packages/engine/test/fixtures/prg-tyo-advance.input.json";
import type { PlanInput } from "@phasejumper/engine";

const tyo = prgTyo as unknown as PlanInput;

function stored(input: PlanInput, id: string): StoredPlan {
  return {
    id,
    input,
    result: {} as StoredPlan["result"],
    engineVersion: "x",
    createdAt: "2027-01-01T00:00:00Z",
  };
}

describe("parseImport (T13)", () => {
  it("reads back an exported backup, inputs only", () => {
    const text = JSON.stringify(
      backupOf([stored(EXAMPLE_TRIP, "a"), stored(tyo, "b")]),
    );
    const parsed = parseImport(text);
    expect(parsed).toEqual({ ok: true, inputs: [EXAMPLE_TRIP, tyo] });
  });

  it("accepts a single trip in share-link format", () => {
    expect(parseImport(JSON.stringify(tyo))).toEqual({
      ok: true,
      inputs: [tyo],
    });
  });

  it("names the problem for each kind of bad file", () => {
    expect(parseImport("{not json")).toEqual({ ok: false, reason: "not-json" });
    expect(parseImport("[1,2]")).toEqual({ ok: false, reason: "not-plans" });
    expect(parseImport('{"hello":1}')).toEqual({
      ok: false,
      reason: "not-plans",
    });
    expect(
      parseImport(
        JSON.stringify({ format: "phasejumper-plans", version: 1, plans: [] }),
      ),
    ).toEqual({ ok: false, reason: "not-plans" });
    expect(parseImport(" ".repeat(MAX_IMPORT_BYTES + 1))).toEqual({
      ok: false,
      reason: "too-large",
    });
  });

  it("imports nothing when one trip in a backup is invalid", () => {
    const broken = {
      ...tyo,
      traveler: { ...tyo.traveler, habitualBedtime: "25:99" },
    };
    const text = JSON.stringify(
      backupOf([stored(tyo, "a"), stored(broken, "b")]),
    );
    const parsed = parseImport(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reason).toBe("invalid");
      expect(parsed.detail).toMatch(/^trip 2: /);
    }
    const missing = parseImport(
      JSON.stringify({
        format: "phasejumper-plans",
        version: 1,
        plans: [{ input: { traveler: {} } }],
      }),
    );
    expect(missing).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("the Start screen's example trip", () => {
  it("is the prg-sfo-delay golden fixture", () => {
    expect(EXAMPLE_TRIP).toEqual(prgSfo);
  });
});
