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
import { describe, expect, it } from "vitest";
import { generatePlan } from "../src/index";
import type { BlockKind, LatLon, PlanInput, PlanResult } from "../src/types";

// T03 acceptance property tests over 500 random inputs.

const ZONES = [
  "Europe/Prague",
  "Europe/London",
  "America/Los_Angeles",
  "America/New_York",
  "America/Phoenix",
  "America/St_Johns",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Asia/Dubai",
  "Australia/Sydney",
  "Australia/Adelaide",
  "Pacific/Auckland",
  "Pacific/Honolulu",
  "Africa/Johannesburg",
  "America/Sao_Paulo",
] as const;

/** A representative airport per zone, for daylight. */
const COORDS: Record<(typeof ZONES)[number], LatLon> = {
  "Europe/Prague": { lat: 50.1, lon: 14.26 },
  "Europe/London": { lat: 51.47, lon: -0.45 },
  "America/Los_Angeles": { lat: 37.62, lon: -122.37 },
  "America/New_York": { lat: 40.64, lon: -73.78 },
  "America/Phoenix": { lat: 33.43, lon: -112.01 },
  "America/St_Johns": { lat: 47.62, lon: -52.75 },
  "Asia/Tokyo": { lat: 35.55, lon: 139.78 },
  "Asia/Kolkata": { lat: 28.56, lon: 77.1 },
  "Asia/Kathmandu": { lat: 27.7, lon: 85.36 },
  "Asia/Dubai": { lat: 25.25, lon: 55.36 },
  "Australia/Sydney": { lat: -33.95, lon: 151.18 },
  "Australia/Adelaide": { lat: -34.95, lon: 138.53 },
  "Pacific/Auckland": { lat: -37.01, lon: 174.79 },
  "Pacific/Honolulu": { lat: 21.32, lon: -157.92 },
  "Africa/Johannesburg": { lat: -26.14, lon: 28.25 },
  "America/Sao_Paulo": { lat: -23.43, lon: -46.47 },
};

const clock = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.constantFrom(0, 15, 30, 45))
  .map(
    ([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
  );

const inputs: fc.Arbitrary<PlanInput> = fc
  .record({
    bed: clock,
    sleepHours: fc.integer({ min: 5, max: 11 }),
    chronotype: fc.constantFrom("morning", "intermediate", "evening"),
    sleepNeedHours: fc.option(fc.integer({ min: 6, max: 10 }), {
      nil: undefined,
    }),
    useMelatonin: fc.boolean(),
    melatoninContraindicated: fc.boolean(),
    caffeine: fc.constantFrom("none", "normal", "heavy"),
    exercise: fc.boolean(),
    meditation: fc.boolean(),
    meals: fc.boolean(),
    preAdjustDays: fc.constantFrom(0, 1, 2, 3),
    home: fc.constantFrom(...ZONES),
    destination: fc.constantFrom(...ZONES),
    // 2026-01-01 .. 2028-12-31, minute resolution.
    departureEpochMinutes: fc.integer({
      min: 29_454_720,
      max: 31_032_000,
    }),
    flightMinutes: fc.integer({ min: 60, max: 1200 }),
    tripDays: fc.option(fc.integer({ min: 1, max: 30 }), { nil: undefined }),
    coordinates: fc.boolean(),
    // Minutes from departure; one optional event and no-workout window.
    event: fc.option(
      fc.tuple(
        fc.integer({ min: -3 * 1440, max: 10 * 1440 }),
        fc.integer({ min: 30, max: 600 }),
      ),
      { nil: undefined },
    ),
    noWorkout: fc.option(
      fc.tuple(
        fc.integer({ min: -3 * 1440, max: 10 * 1440 }),
        fc.integer({ min: 30, max: 600 }),
      ),
      { nil: undefined },
    ),
  })
  .map((r) => {
    const bedMinutes =
      Number(r.bed.slice(0, 2)) * 60 + Number(r.bed.slice(3, 5));
    const wakeMinutes = (bedMinutes + r.sleepHours * 60) % 1440;
    const wake = `${String(Math.floor(wakeMinutes / 60)).padStart(2, "0")}:${String(wakeMinutes % 60).padStart(2, "0")}`;
    const dep = Temporal.Instant.fromEpochMilliseconds(
      r.departureEpochMinutes * 60_000,
    );
    const arr = dep.add({ minutes: r.flightMinutes });
    const window = ([offset, length]: [number, number]) => ({
      start: dep
        .add({ minutes: offset })
        .toZonedDateTimeISO(r.destination)
        .toPlainDateTime()
        .toString(),
      end: dep
        .add({ minutes: offset + length })
        .toZonedDateTimeISO(r.destination)
        .toPlainDateTime()
        .toString(),
      tz: r.destination,
    });
    return {
      traveler: {
        habitualBedtime: r.bed,
        habitualWake: wake,
        chronotype: r.chronotype,
        ...(r.sleepNeedHours === undefined
          ? {}
          : { sleepNeedHours: r.sleepNeedHours }),
        useMelatonin: r.useMelatonin,
        melatoninContraindicated: r.melatoninContraindicated,
        caffeine: r.caffeine,
        exercise: { enabled: r.exercise },
        meditation: { enabled: r.meditation },
        mealTiming: { enabled: r.meals },
        preAdjustDays: r.preAdjustDays,
      },
      itinerary: {
        homeTz: r.home,
        destinationTz: r.destination,
        legs: [
          {
            departureAirport: "AAA",
            arrivalAirport: "BBB",
            departureLocal: dep
              .toZonedDateTimeISO(r.home)
              .toPlainDateTime()
              .toString(),
            arrivalLocal: arr
              .toZonedDateTimeISO(r.destination)
              .toPlainDateTime()
              .toString(),
            departureTz: r.home,
            arrivalTz: r.destination,
            ...(r.coordinates
              ? {
                  departureLatLon: COORDS[r.home],
                  arrivalLatLon: COORDS[r.destination],
                }
              : {}),
          },
        ],
        ...(r.tripDays === undefined ? {} : { tripDays: r.tripDays }),
      },
      constraints: {
        ...(r.event === undefined
          ? {}
          : { mustBeAwake: [{ ...window(r.event), label: "Event" }] }),
        ...(r.noWorkout === undefined
          ? {}
          : { noWorkoutWindows: [window(r.noWorkout)] }),
      },
      now: "2026-01-01T00:00:00Z",
    } satisfies PlanInput;
  });

const RUNS = { numRuns: 500, seed: 20261012 };

// Same seed → every property sees the same inputs, so plans are cached.
const plans = new Map<string, PlanResult>();

function check(predicate: (input: PlanInput, plan: PlanResult) => void): void {
  fc.assert(
    fc.property(inputs, (input) => {
      const key = JSON.stringify(input);
      let plan = plans.get(key);
      if (plan === undefined) {
        plan = generatePlan(input);
        plans.set(key, plan);
      }
      predicate(input, plan);
    }),
    RUNS,
  );
}

/**
 * Minutes CBTmin still has to travel in the chosen direction, in destination
 * wall time. Negative = past the target, which only a DST change at the
 * destination can cause (≤ 60 min). Real distances are ≤ 1320 min (|delta| ≥ 2 h).
 */
function remaining(
  plan: PlanResult,
  input: PlanInput,
  cbtMinUtc: string,
): number {
  const z = Temporal.Instant.from(cbtMinUtc).toZonedDateTimeISO(
    input.itinerary.destinationTz,
  );
  const [h, m] = plan.decision.targetCbtMinLocal.split(":").map(Number);
  const diff = z.hour * 60 + z.minute - ((h ?? 0) * 60 + (m ?? 0));
  const wrap = (x: number): number => ((x % 1440) + 1440) % 1440;
  const d = plan.decision.direction === "advance" ? wrap(diff) : wrap(-diff);
  return d >= 1380 ? d - 1440 : d;
}

// 500 plans per property; generous timeout so slower CI runners do not flake.
describe("engine properties", { timeout: 30_000 }, () => {
  it("every block has endUtc > startUtc", () => {
    check((_input, plan) => {
      for (const day of plan.days) {
        for (const b of day.blocks) {
          expect(Date.parse(b.endUtc)).toBeGreaterThan(Date.parse(b.startUtc));
        }
      }
    });
  });

  it("CBTmin moves monotonically toward the target", () => {
    check((input, plan) => {
      const { direction } = plan.decision;
      if (direction !== "advance" && direction !== "delay") return;
      const sign = direction === "advance" ? -1 : 1;
      const cbt = plan.days.map((d) => Date.parse(d.cbtMinUtc));
      for (let i = 1; i < cbt.length; i += 1) {
        const step = ((cbt[i] ?? 0) - (cbt[i - 1] ?? 0)) / 60_000;
        // Each step is one day plus a shift in the chosen direction, never
        // more than the rate (≤ 2 h/day).
        expect(sign * (step - 1440)).toBeGreaterThan(0);
        expect(sign * (step - 1440)).toBeLessThanOrEqual(120);
        // Distance to the target never grows, except by a DST change at the
        // destination between the two days (at most 60 min).
        const before = remaining(
          plan,
          input,
          plan.days[i - 1]?.cbtMinUtc ?? "",
        );
        const after = remaining(plan, input, plan.days[i]?.cbtMinUtc ?? "");
        expect(after).toBeLessThanOrEqual(before + 60);
      }
      const last = plan.days[plan.days.length - 1];
      expect(last?.effectiveShiftHours).toBe(0);
      // Forecast: never more than rate + 0.3 h in a day (§2.8).
      for (const d of plan.days) {
        expect(d.effectiveShiftHours).toBeLessThanOrEqual(2.3);
      }
      expect(
        Math.abs(remaining(plan, input, last?.cbtMinUtc ?? "")),
      ).toBeLessThanOrEqual(60);
      expect(last?.misalignmentAfter).toBeLessThanOrEqual(1);
    });
  });

  it("never exceeds chosenDays + 1 + preAdjustDays days", () => {
    check((input, plan) => {
      expect(plan.days.length).toBeLessThanOrEqual(
        plan.decision.chosenDays + 1 + input.traveler.preAdjustDays,
      );
    });
  });

  it("melatonin blocks never appear when contraindicated or not opted in", () => {
    check((input, plan) => {
      const t = input.traveler;
      if (t.useMelatonin && t.melatoninContraindicated !== true) return;
      for (const day of plan.days) {
        expect(day.blocks.map((b) => b.kind)).not.toContain("MELATONIN_WINDOW");
      }
    });
  });

  it("priority trimming never leaves SLEEP/AVOID/SEEK blocks overlapping", () => {
    const exclusive: ReadonlySet<BlockKind> = new Set([
      "SLEEP",
      "SLEEP_INFLIGHT",
      "AVOID_LIGHT",
      "SEEK_LIGHT",
      "SEEK_LIGHT_ARTIFICIAL",
      "LIGHT_INFLIGHT_WINDOW",
    ]);
    check((_input, plan) => {
      const spans = plan.days
        .flatMap((d) => d.blocks)
        .filter((b) => exclusive.has(b.kind))
        .map((b) => [Date.parse(b.startUtc), Date.parse(b.endUtc)] as const)
        .sort((x, y) => x[0] - y[0]);
      for (let i = 1; i < spans.length; i += 1) {
        expect(spans[i]?.[0]).toBeGreaterThanOrEqual(spans[i - 1]?.[1] ?? 0);
      }
    });
  });

  it("nothing is scheduled inside sleep, and trimmed blocks are ≥ 15 min", () => {
    check((_input, plan) => {
      const all = plan.days.flatMap((d) => d.blocks);
      const sleeps = all.filter(
        (b) => b.kind === "SLEEP" || b.kind === "SLEEP_INFLIGHT",
      );
      for (const b of all) {
        if (b.kind === "SLEEP" || b.kind === "SLEEP_INFLIGHT") continue;
        const len = (Date.parse(b.endUtc) - Date.parse(b.startUtc)) / 60_000;
        if (b.kind !== "MEAL" && b.kind !== "CAFFEINE_STOP") {
          expect(len).toBeGreaterThanOrEqual(15);
        }
        for (const s of sleeps) {
          const overlap =
            Date.parse(b.startUtc) < Date.parse(s.endUtc) &&
            Date.parse(s.startUtc) < Date.parse(b.endUtc);
          expect(overlap).toBe(false);
        }
      }
    });
  });

  it("is deterministic", () => {
    check((input, plan) => {
      expect(generatePlan(input)).toEqual(plan);
    });
  });
});
