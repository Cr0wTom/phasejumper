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
import { describe, expect, it } from "vitest";
import { generatePlan, type PlanInput } from "../src";

const tyo = JSON.parse(
  readFileSync(
    new URL("./fixtures/prg-tyo-advance.input.json", import.meta.url),
    "utf8",
  ),
) as PlanInput;

describe("no-exercise windows", () => {
  it("never shows two touching no-exercise blocks on a day", () => {
    const plan = generatePlan({
      ...tyo,
      // Three prep days: the shape in which the two windows meet.
      traveler: {
        ...tyo.traveler,
        exercise: { enabled: true },
        preAdjustDays: 3,
      },
    });
    for (const day of plan.days) {
      const avoid = day.blocks.filter((b) => b.kind === "EXERCISE_AVOID");
      for (const a of avoid) {
        for (const b of avoid) {
          if (a !== b) expect(a.endUtc).not.toBe(b.startUtc);
        }
      }
    }
    const merged = plan.days
      .flatMap((d) => d.blocks)
      .filter((b) => b.reasonCode === "EXERCISE_AVOID_EVENING");
    expect(merged.length).toBeGreaterThan(0);
  });
});
