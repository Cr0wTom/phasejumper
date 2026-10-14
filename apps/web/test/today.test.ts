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

import { generatePlan, type PlanInput } from "@phasejumper/engine";
import { describe, expect, it } from "vitest";
import { todayView } from "../src/today";
import prgSfo from "../../../packages/engine/test/fixtures/prg-sfo-delay.input.json";

const input = prgSfo as unknown as PlanInput;
const result = generatePlan(input);

describe("today view", () => {
  it("before the plan: no current block, the first block is next", () => {
    const view = todayView(input, result, "2027-01-01T12:00:00Z");
    expect(view.phase).toBe("before");
    expect(view.zone).toBe("Europe/Prague");
    expect(view.current).toBeUndefined();
    expect(view.next?.block.kind).toBe("SLEEP");
  });

  it("during sleep: sleep is current, with minutes until it ends", () => {
    const sleep = result.days[2]?.blocks.find((b) => b.kind === "SLEEP");
    if (sleep === undefined) throw new Error("fixture: no sleep on day 2");
    const mid = new Date(
      (Date.parse(sleep.startUtc) + Date.parse(sleep.endUtc)) / 2,
    ).toISOString();
    const view = todayView(input, result, mid);
    expect(view.phase).toBe("during");
    expect(view.zone).toBe("America/Los_Angeles");
    expect(view.current?.block).toBe(sleep);
    expect(view.current?.minutes).toBe(
      Math.ceil((Date.parse(sleep.endUtc) - Date.parse(mid)) / 60_000),
    );
    expect(view.next).toBeDefined();
  });

  it("never shows background windows (caffeine fits, no exercise) as current or next", () => {
    for (
      let t = Date.parse("2027-01-15T00:00:00Z");
      t < Date.parse("2027-01-21T00:00:00Z");
      t += 37 * 60_000
    ) {
      const view = todayView(input, result, new Date(t).toISOString());
      for (const item of [view.current, view.next]) {
        expect([
          "CAFFEINE_OK",
          "CAFFEINE_LATE_OK",
          "EXERCISE_AVOID",
          "EXERCISE_OK",
        ]).not.toContain(item?.block.kind);
      }
    }
  });

  it("after the plan: complete, nothing next", () => {
    const view = todayView(input, result, "2027-03-01T12:00:00Z");
    expect(view.phase).toBe("after");
    expect(view.next).toBeUndefined();
  });
});
