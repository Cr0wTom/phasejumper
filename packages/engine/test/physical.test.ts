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

import fc from "fast-check";
import { Temporal } from "temporal-polyfill";
import { expect, it } from "vitest";
import { generatePlan } from "../src/index";
import type { Block, BlockKind, PlanInput } from "../src/types";
import { inputs, multiLegInputs } from "./arbitraries";

type I = { s: number; e: number };
const ms = (x: string) => Temporal.Instant.from(x).epochMilliseconds;
const iv = (b: Block): I => ({ s: ms(b.startUtc), e: ms(b.endUtc) });
const ov = (a: I, b: I) => a.s < b.e && b.s < a.e;
const H = 3_600_000;

const GROUND: BlockKind[] = [
  "SLEEP",
  "SEEK_LIGHT",
  "SEEK_LIGHT_ARTIFICIAL",
  "EXERCISE_GOOD",
  "EXERCISE_OK",
  "EXERCISE_OPTIONAL_WALK",
];
const GROUPS: Record<string, BlockKind[]> = {
  sleep: ["SLEEP", "SLEEP_INFLIGHT", "NAP", "NSDR", "WIND_DOWN"],
  light: [
    "SEEK_LIGHT",
    "SEEK_LIGHT_ARTIFICIAL",
    "LIGHT_INFLIGHT_WINDOW",
    "AVOID_LIGHT",
  ],
  exercise: [
    "EXERCISE_GOOD",
    "EXERCISE_OK",
    "EXERCISE_OPTIONAL_WALK",
    "EXERCISE_AVOID",
  ],
};
const AWAKE: BlockKind[] = [
  "SEEK_LIGHT",
  "SEEK_LIGHT_ARTIFICIAL",
  "LIGHT_INFLIGHT_WINDOW",
  "EXERCISE_GOOD",
  "EXERCISE_OK",
  "EXERCISE_OPTIONAL_WALK",
  "MEAL",
  "CAFFEINE_STOP",
  "WIND_DOWN",
  "NSDR",
  "NAP",
  "MELATONIN_WINDOW",
];

// Physical invariants over 500 random trips: what no real day can contain.
// Each rule names what went wrong; the test lists every broken rule with an
// example so a regression is easy to read.

function audit(trips: fc.Arbitrary<PlanInput>, seed: number): string[] {
  const hits = new Map<string, { n: number; ex: string }>();
  const hit = (rule: string, ex: string) => {
    const h = hits.get(rule);
    if (h) h.n++;
    else hits.set(rule, { n: 1, ex });
  };
  let plansN = 0;
  fc.assert(
    fc.property(inputs, (input: PlanInput) => {
      const plan = generatePlan(input);
      plansN++;
      const raw = input.itinerary.legs.map((l) => ({
        s: Temporal.PlainDateTime.from(l.departureLocal).toZonedDateTime(
          l.departureTz,
        ).epochMilliseconds,
        e: Temporal.PlainDateTime.from(l.arrivalLocal).toZonedDateTime(
          l.arrivalTz,
        ).epochMilliseconds,
      }));
      // Awake before a departure: 3 h from home or a stay, 1 h before a
      // connection (leaving within 24 h of the previous landing).
      const legs = raw.map((f, k) => {
        const prev = raw[k - 1];
        const connecting = prev !== undefined && f.s - prev.e < 24 * H;
        return { ...f, before: connecting ? H : 3 * H };
      });
      const all = plan.days.flatMap((d, di) =>
        d.blocks.map((b) => ({ b, di, i: iv(b) })),
      );
      const tag = (b: Block) => `${b.kind} ${b.startUtc}→${b.endUtc}`;
      for (const { b, i } of all) {
        if (
          i.e <= i.s &&
          !["CAFFEINE_STOP", "MEAL", "MELATONIN_WINDOW"].includes(b.kind)
        )
          hit("R8 empty or negative block", tag(b));
        if (
          b.kind === "SLEEP_INFLIGHT" &&
          !legs.some((f) => i.s >= f.s && i.e <= f.e)
        )
          hit(
            "R1 sleep on board outside the flight",
            tag(b) +
              ` legs ${legs.map((f) => new Date(f.s).toISOString() + "→" + new Date(f.e).toISOString())}`,
          );
        if (GROUND.includes(b.kind) && legs.some((f) => ov(i, f)))
          hit(`R2 ground-only ${b.kind} during a flight`, tag(b));
        if (
          b.kind === "SLEEP" &&
          legs.some((f) => ov(i, { s: f.s - f.before, e: f.s }))
        )
          hit("R3 sleep in the awake time before a departure", tag(b));
        if (
          b.kind === "SLEEP" &&
          legs.some((f) => ov(i, { s: f.e, e: f.e + 2 * H }))
        )
          hit("R3b sleep within 2 h after landing", tag(b));
        if (
          b.kind === "NAP" &&
          !legs.some((f) => i.s >= f.s && i.e <= f.e) &&
          legs.some(
            (f) =>
              ov(i, { s: f.e, e: f.e + 2 * H }) ||
              ov(i, { s: f.s - f.before, e: f.s }),
          )
        )
          hit("R3c ground nap at the airport", tag(b));
        if (b.kind === "SLEEP" && i.e - i.s < 2 * H)
          hit("R9 'Sleep' block under 2 h", tag(b));
      }
      const finalLanding = legs[legs.length - 1]?.e;
      for (const { b, i } of all) {
        if (b.kind === "EXERCISE_OPTIONAL_WALK" && i.s !== finalLanding)
          hit("R11 arrival walk not at the final landing", tag(b));
      }
      for (const [g, kinds] of Object.entries(GROUPS)) {
        const xs = all.filter((x) => kinds.includes(x.b.kind));
        for (let a = 0; a < xs.length; a++)
          for (let c = a + 1; c < xs.length; c++) {
            const A = xs[a]!,
              C = xs[c]!;
            if (ov(A.i, C.i))
              hit(
                `R4 overlap in ${g}: ${A.b.kind} + ${C.b.kind}`,
                `${tag(A.b)} | ${tag(C.b)}`,
              );
          }
      }
      const sleeps = all.filter(
        (x) => x.b.kind === "SLEEP" || x.b.kind === "SLEEP_INFLIGHT",
      );
      for (const x of all) {
        if (!AWAKE.includes(x.b.kind)) continue;
        if (
          x.b.kind === "NAP" ||
          x.b.kind === "NSDR" ||
          x.b.kind === "WIND_DOWN"
        ) {
          if (sleeps.some((s) => ov(s.i, x.i)))
            hit(`R5 ${x.b.kind} during sleep`, tag(x.b));
          continue;
        }
        if (sleeps.some((s) => ov(s.i, x.i)))
          hit(`R5 awake activity ${x.b.kind} during sleep`, tag(x.b));
      }
      for (const x of all) {
        if (x.b.kind !== "EXERCISE_GOOD" && x.b.kind !== "EXERCISE_OK")
          continue;
        const next = sleeps
          .map((s) => s.i.s)
          .filter((s) => s >= x.i.e)
          .sort((a, b) => a - b)[0];
        if (next !== undefined && next - x.i.e < 3 * H)
          hit(`R6 ${x.b.kind} within 3 h of sleep`, tag(x.b));
      }
      for (const x of all) {
        if (x.b.kind !== "CAFFEINE_OK" && x.b.kind !== "CAFFEINE_LATE_OK")
          continue;
        if (sleeps.some((s) => ov(s.i, x.i)))
          hit(`R7 ${x.b.kind} overlaps sleep`, tag(x.b));
      }
    }),
    { numRuns: 500, seed },
  );
  const lines = [...hits.entries()].map(
    ([rule, h]) => `${h.n}× ${rule} (e.g. ${h.ex})`,
  );
  expect(plansN).toBe(500);
  return lines;
}

it("single-flight trips never contain a physically impossible schedule", () => {
  expect(audit(inputs, 20261014)).toEqual([]);
}, 120_000);

it("trips with connections and layovers never contain one either", () => {
  expect(audit(multiLegInputs, 20261015)).toEqual([]);
}, 120_000);
