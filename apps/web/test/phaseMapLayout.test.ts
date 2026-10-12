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
import { layoutPlan, pieces } from "../src/components/PhaseMap/layout";
import { Temporal } from "temporal-polyfill";
import nycLonDst from "../../../packages/engine/test/fixtures/nyc-lon-dst.input.json";
import prgSfoDelay from "../../../packages/engine/test/fixtures/prg-sfo-delay.input.json";

const dst = nycLonDst as unknown as PlanInput;
const sfo = prgSfoDelay as unknown as PlanInput;

function lastSleep(input: PlanInput, axis: "destination" | "home" | "local") {
  const result = generatePlan(input);
  const lastDay = result.days.length - 1;
  const rows = layoutPlan(input, result, axis);
  return rows.flatMap((r) =>
    r.segments
      .filter((s) => s.dayIndex === lastDay && s.block.kind === "SLEEP")
      .map((s) => ({
        date: r.date,
        startMin: s.startMin,
        endMin: s.endMin,
        from: s.from,
        to: s.to,
      })),
  );
}

describe("phase map layout", () => {
  it("rows are consecutive calendar dates, none skipped or repeated", () => {
    for (const axis of ["destination", "home", "local"] as const) {
      const rows = layoutPlan(sfo, generatePlan(sfo), axis);
      for (let i = 1; i < rows.length; i += 1) {
        const prev = Temporal.PlainDate.from(rows[i - 1]?.date ?? "");
        expect(rows[i]?.date).toBe(prev.add({ days: 1 }).toString());
      }
    }
  });

  it("DST fixture: the settled night reads 23:00–07:00 London in destination and local axes", () => {
    for (const axis of ["destination", "local"] as const) {
      const sleep = lastSleep(dst, axis);
      expect(sleep[0]).toMatchObject({
        startMin: 23 * 60,
        endMin: 1440,
        from: "23:00",
        to: "07:00",
      });
      expect(sleep[1]).toMatchObject({ startMin: 0, endMin: 7 * 60 });
      expect(sleep[0]?.date > "2027-03-28").toBe(true);
    }
  });

  it("DST fixture: the same night reads 18:00–02:00 in the home (New York) axis", () => {
    const sleep = lastSleep(dst, "home");
    expect(sleep[0]).toMatchObject({
      startMin: 18 * 60,
      from: "18:00",
      to: "02:00",
    });
    expect(sleep[1]).toMatchObject({ startMin: 0, endMin: 2 * 60 });
  });

  it("splits at midnight and at a spring-forward clock change", () => {
    const at = (s: string) => Temporal.Instant.from(s);
    // 2027-03-28 London: 01:00 GMT → 02:00 BST.
    expect(
      pieces(
        at("2027-03-27T23:30:00Z"),
        at("2027-03-28T02:00:00Z"),
        "Europe/London",
      ),
    ).toEqual([
      { date: "2027-03-27", startMin: 1410, endMin: 1440 },
      { date: "2027-03-28", startMin: 0, endMin: 60 },
      { date: "2027-03-28", startMin: 120, endMin: 180 },
    ]);
  });

  it("the target line sits at the target clock time in the destination axis", () => {
    const result = generatePlan(dst);
    for (const r of layoutPlan(dst, result, "destination")) {
      expect(r.targetMin).toBe(4 * 60 + 30);
    }
  });
});
