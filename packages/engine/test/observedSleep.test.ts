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

import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import {
  generatePlan,
  validatePlanInput,
  type PlanInput,
  type PlanResult,
} from "../src";
import { prgTyo } from "./trips";

// "I slept differently last night": reported sleep re-anchors the body clock
// for the days after it. Days before stay as planned.

const sleeps = (plan: PlanResult) =>
  plan.days.map((d) => d.blocks.find((b) => b.kind === "SLEEP"));

function withReport(input: PlanInput, start: string, end: string): PlanInput {
  return { ...input, observedSleep: [{ start, end }] };
}

/** The planned main sleep of day `i` as instants. */
function planned(plan: PlanResult, i: number) {
  const s = sleeps(plan)[i];
  if (s === undefined) throw new Error(`no sleep on day ${i}`);
  return {
    start: Temporal.Instant.from(s.startUtc),
    end: Temporal.Instant.from(s.endUtc),
  };
}

describe("reported sleep", () => {
  const base = prgTyo();
  const plan = generatePlan(base);

  it("reporting the planned sleep changes nothing", () => {
    const p = planned(plan, 4);
    const same = generatePlan(
      withReport(base, p.start.toString(), p.end.toString()),
    );
    expect(JSON.stringify(same)).toBe(JSON.stringify(plan));
  });

  it("a later sleep on an advancing plan moves the following nights later", () => {
    expect(plan.decision.direction).toBe("advance");
    const p = planned(plan, 4);
    const later = generatePlan(
      withReport(
        base,
        p.start.add({ hours: 2 }).toString(),
        p.end.add({ hours: 2 }).toString(),
      ),
    );
    // Days before the reported night are unchanged, and so is that night
    // itself; what follows is planned from the night actually slept.
    expect(JSON.stringify(later.days.slice(0, 4))).toBe(
      JSON.stringify(plan.days.slice(0, 4)),
    );
    expect(later.days[4]?.blocks.find((b) => b.kind === "SLEEP")).toEqual(
      plan.days[4]?.blocks.find((b) => b.kind === "SLEEP"),
    );
    const next = later.days[5]?.blocks.find((b) => b.kind === "SLEEP");
    const before = plan.days[5]?.blocks.find((b) => b.kind === "SLEEP");
    expect(next).toBeDefined();
    expect(before).toBeDefined();
    if (next === undefined || before === undefined) return;
    expect(Date.parse(next.startUtc)).toBeGreaterThan(
      Date.parse(before.startUtc),
    );
    expect(later.days.length).toBeGreaterThanOrEqual(plan.days.length);
    expect(later.warnings.map((w) => w.code)).toContain(
      "PLAN_ADJUSTED_TO_SLEEP",
    );
  });

  it("ignores naps and reports far from any planned night", () => {
    const p = planned(plan, 4);
    const nap = generatePlan(
      withReport(
        base,
        p.start.add({ hours: 9 }).toString(),
        p.start.add({ hours: 10 }).toString(),
      ),
    );
    expect(JSON.stringify(nap)).toBe(JSON.stringify(plan));
  });

  it("caps how far one report can move the body clock", () => {
    const p = planned(plan, 3);
    const far = generatePlan(
      withReport(
        base,
        p.start.add({ hours: 7 }).toString(),
        p.end.add({ hours: 7 }).toString(),
      ),
    );
    const capped = generatePlan(
      withReport(
        base,
        p.start.add({ hours: 4 }).toString(),
        p.end.add({ hours: 4 }).toString(),
      ),
    );
    expect(JSON.stringify(far.days)).toBe(JSON.stringify(capped.days));
  });

  it("rejects bad reports", () => {
    expect(
      validatePlanInput(withReport(base, "nope", "2027-01-01T00:00:00Z")).ok,
    ).toBe(false);
    expect(
      validatePlanInput(
        withReport(base, "2027-01-02T00:00:00Z", "2027-01-01T00:00:00Z"),
      ).ok,
    ).toBe(false);
  });
});
