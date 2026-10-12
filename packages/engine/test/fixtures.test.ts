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

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generatePlan } from "../src/index";
import type { PlanInput, PlanResult } from "../src/types";

// Golden fixtures (§9.3). The .expected.json files are written only by
// `vitest -u` (see docs/CONTRIBUTING.md); a normal run fails on any diff.

const DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));

const NAMES = [
  "prg-sfo-delay",
  "prg-tyo-advance",
  "prg-syd-antidromic",
  "prg-jfk-meetings",
  "prg-lhr-light-touch",
  "sfo-prg-quick",
  "hel-dec-dark",
  "nyc-lon-dst",
] as const;

type Name = (typeof NAMES)[number];

function load(name: Name): PlanInput {
  return JSON.parse(
    readFileSync(`${DIR}${name}.input.json`, "utf8"),
  ) as PlanInput;
}

const plans = new Map<Name, PlanResult>(
  NAMES.map((name) => [name, generatePlan(load(name))]),
);

function plan(name: Name): PlanResult {
  const p = plans.get(name);
  if (p === undefined) throw new Error(`no plan for ${name}`);
  return p;
}

/** True only under `vitest -u` (Vitest's internal snapshot mode is "all"). */
function updating(): boolean {
  const state = expect.getState().snapshotState as unknown as {
    _updateSnapshot?: string;
  };
  return state._updateSnapshot === "all";
}

function kinds(name: Name): Set<string> {
  return new Set(plan(name).days.flatMap((d) => d.blocks.map((b) => b.kind)));
}

describe("golden fixtures", () => {
  it("are exactly the §9.3 trips, each with a committed expected file", () => {
    const inputs = readdirSync(DIR)
      .filter((f) => f.endsWith(".input.json"))
      .map((f) => f.replace(".input.json", ""))
      .sort();
    expect(inputs).toEqual([...NAMES].sort());
    if (updating()) return;
    for (const name of NAMES) {
      expect(existsSync(`${DIR}${name}.expected.json`), name).toBe(true);
    }
  });

  it.each(NAMES)("%s matches its expected plan", async (name) => {
    // Vitest would write a missing file on a normal run; only -u may.
    if (!updating() && !existsSync(`${DIR}${name}.expected.json`)) {
      throw new Error(
        `${name}.expected.json is missing; generate it with vitest -u`,
      );
    }
    await expect(
      `${JSON.stringify(plan(name), null, 2)}\n`,
    ).toMatchFileSnapshot(`./fixtures/${name}.expected.json`);
  });
});

// What each fixture exercises (§9.3), so a regenerated snapshot cannot
// silently stop covering it.
describe("fixture coverage", () => {
  it("prg-sfo-delay: long westward delay with in-flight sleep", () => {
    expect(plan("prg-sfo-delay").decision).toMatchObject({
      direction: "delay",
      deltaHours: -9,
    });
    expect(kinds("prg-sfo-delay")).toContain("SLEEP_INFLIGHT");
  });

  it("prg-tyo-advance: eastward advance, melatonin, 2 pre-adjust days", () => {
    const p = plan("prg-tyo-advance");
    expect(p.decision).toMatchObject({ direction: "advance", deltaHours: 8 });
    expect(kinds("prg-tyo-advance")).toContain("MELATONIN_WINDOW");
    // Day 0 is two days before departure (2027-01-15, Prague).
    expect(p.days[0]?.cbtMinUtc.startsWith("2027-01-13")).toBe(true);
  });

  it("prg-syd-antidromic: delays 15 h instead of advancing 9 h, two legs", () => {
    const p = plan("prg-syd-antidromic");
    expect(p.decision).toMatchObject({ direction: "delay", deltaHours: 9 });
    expect(p.decision.daysDelay).toBeLessThan(p.decision.daysAdvance);
    const zones = new Set(
      p.days.flatMap((d) => d.blocks.map((b) => b.localTz)),
    );
    expect(zones).toContain("Asia/Dubai");
  });

  it("prg-jfk-meetings: must-be-awake blocks clip sleep", () => {
    const p = plan("prg-jfk-meetings");
    expect(p.decision).toMatchObject({ direction: "delay", deltaHours: -6 });
    expect(p.days.some((d) => d.flags.includes("SHORT_SLEEP_DAY"))).toBe(true);
    expect(kinds("prg-jfk-meetings")).toContain("NAP");
  });

  it("prg-lhr-light-touch: no shifting plan", () => {
    expect(plan("prg-lhr-light-touch").decision.direction).toBe("none");
  });

  it("sfo-prg-quick: short-trip", () => {
    expect(plan("sfo-prg-quick").decision).toMatchObject({
      direction: "short-trip",
      deltaHours: 9,
    });
  });

  it("hel-dec-dark: artificial light substitution", () => {
    expect(plan("hel-dec-dark").decision).toMatchObject({
      direction: "delay",
      deltaHours: -7,
    });
    expect(kinds("hel-dec-dark")).toContain("SEEK_LIGHT_ARTIFICIAL");
  });

  it("nyc-lon-dst: +4 h → +5 h with the EU change inside the plan; 5 shift days, not 4", () => {
    const p = plan("nyc-lon-dst");
    expect(p.decision).toMatchObject({
      direction: "advance",
      deltaHours: 4,
      daysAdvance: 4,
    });
    expect(p.decision.chosenDays).toBe(5);
    const first = p.days[0]?.cbtMinUtc ?? "";
    const last = p.days[p.days.length - 1]?.cbtMinUtc ?? "";
    expect(
      first < "2027-03-28T01:00:00Z" && last > "2027-03-28T01:00:00Z",
    ).toBe(true);
    expect(p.days[p.days.length - 1]?.misalignmentAfter).toBe(0);
  });
});
