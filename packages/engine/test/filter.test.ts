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
import { generatePlan } from "../src/index";
import type { Block, PlanDay, PlanResult } from "../src/types";
import { leg, prgSfo, prgSyd, prgTyo, trip } from "./trips";

// T04 acceptance and feasibility-pass behaviour (§2.7–2.8).

const minutes = (b: Block): number =>
  (Date.parse(b.endUtc) - Date.parse(b.startUtc)) / 60_000;

/** ISO local date-time of an instant in a zone, for constraint input. */
function local(utc: string, tz: string): string {
  return Temporal.Instant.from(utc)
    .toZonedDateTimeISO(tz)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}

function kinds(day: PlanDay | undefined): string[] {
  return (day?.blocks ?? []).map((b) => b.kind);
}

function sleepOf(day: PlanDay | undefined): Block | undefined {
  return day?.blocks.find((b) => b.kind === "SLEEP");
}

describe("rule 1: flights", () => {
  it("PRG 10:30 → SFO 13:05: ≥ 4 h of sleep in the air becomes SLEEP_INFLIGHT", () => {
    // A late sleeper (02:00–10:00) pre-adjusting 3 days later lands their
    // departure-day sleep at 08:00–16:00 Prague, mostly on the plane.
    const plan = generatePlan(
      prgSfo({
        traveler: {
          habitualBedtime: "02:00",
          habitualWake: "10:00",
          preAdjustDays: 3,
        },
      }),
    );
    const day = plan.days.find((d) => kinds(d).includes("SLEEP_INFLIGHT"));
    expect(day).toBeDefined();
    expect(day?.flags).toContain("FLIGHT_DAY");
    const sleep = day?.blocks.find((b) => b.kind === "SLEEP_INFLIGHT");
    expect(sleep?.reasonCode).toBe("SLEEP_INFLIGHT");
  });

  it("with the same flight, a regular sleeper never sleeps in the air", () => {
    const plan = generatePlan(prgSfo());
    expect(plan.days.flatMap(kinds)).not.toContain("SLEEP_INFLIGHT");
    expect(plan.days[0]?.flags).toContain("FLIGHT_DAY");
  });

  it("light inside a flight becomes LIGHT_INFLIGHT_WINDOW with confidence C", () => {
    // Departing 06:00 puts the 07:00 advance light block in the air.
    const plan = generatePlan(
      trip(
        [
          leg(
            "PRG",
            "HND",
            "2027-01-15T06:00",
            "2027-01-16T02:00",
            "Europe/Prague",
            "Asia/Tokyo",
          ),
        ],
        "Asia/Tokyo",
      ),
    );
    const inflight = plan.days[0]?.blocks.find(
      (b) => b.kind === "LIGHT_INFLIGHT_WINDOW",
    );
    expect(inflight?.confidence).toBe("C");
    expect(inflight?.reasonCode).toBe("LIGHT_INFLIGHT");
  });

  it("flight days carry the in-flight advice once", () => {
    const plan = generatePlan(prgSfo());
    const day0 = plan.staticAdvice.filter((a) => a.dayIndex === 0);
    expect(day0).toHaveLength(5);
    expect(new Set(day0.map((a) => a.text)).size).toBe(5);
  });

  it("an arrival-day NSDR after a flight > 8 h, between 14:00 and 18:00 local", () => {
    const nsdr = generatePlan(prgSfo())
      .days.flatMap((d) => d.blocks)
      .find((b) => b.kind === "NSDR");
    expect(nsdr).toBeDefined();
    if (nsdr !== undefined) {
      const t = Temporal.Instant.from(nsdr.startUtc).toZonedDateTimeISO(
        "America/Los_Angeles",
      );
      expect(t.hour).toBeGreaterThanOrEqual(14);
      expect(minutes(nsdr)).toBe(20);
    }
  });

  it("flight days swap exercise windows for an optional walk at arrival", () => {
    // A 06:00 departure lands at 17:00Z, inside day 0's waking time and
    // more than 3 h before sleep.
    const plan = generatePlan(
      trip(
        [
          leg(
            "PRG",
            "HND",
            "2027-01-15T06:00",
            "2027-01-16T02:00",
            "Europe/Prague",
            "Asia/Tokyo",
          ),
        ],
        "Asia/Tokyo",
      ),
    );
    const flightDays = plan.days.filter((d) => d.flags.includes("FLIGHT_DAY"));
    expect(flightDays.length).toBeGreaterThan(0);
    for (const d of flightDays) expect(kinds(d)).not.toContain("EXERCISE_GOOD");
    const walk = plan.days[0]?.blocks.find(
      (b) => b.kind === "EXERCISE_OPTIONAL_WALK",
    );
    expect(walk?.startUtc).toBe("2027-01-15T17:00:00Z");
    expect(walk !== undefined && minutes(walk)).toBe(30);
  });

  it("no walk when landing inside the planned sleep", () => {
    // PRG 12:00 → HND 08:00 lands during the (clipped) first night.
    const all = generatePlan(prgTyo()).days.flatMap(kinds);
    expect(all).not.toContain("EXERCISE_OPTIONAL_WALK");
  });
});

describe("rule 2: must-be-awake", () => {
  function clippedPlan(keptHours: number): {
    plan: PlanResult;
    eventEnd: string;
  } {
    const base = generatePlan(prgTyo());
    const sleep = sleepOf(base.days[5]);
    if (sleep === undefined) throw new Error("fixture: no sleep on day 5");
    const eventStart = Temporal.Instant.from(sleep.startUtc)
      .add({ hours: keptHours })
      .toString();
    const plan = generatePlan(
      prgTyo({
        constraints: {
          mustBeAwake: [
            {
              start: local(eventStart, "Asia/Tokyo"),
              end: local(sleep.endUtc, "Asia/Tokyo"),
              tz: "Asia/Tokyo",
              label: "Call",
            },
          ],
        },
      }),
    );
    return { plan, eventEnd: sleep.endUtc };
  }

  it("clipping sleep to 4 h yields SHORT_SLEEP_DAY + a 20 min NAP", () => {
    const { plan, eventEnd } = clippedPlan(4);
    const day = plan.days[5];
    expect(day?.flags).toContain("SHORT_SLEEP_DAY");
    expect(plan.warnings).toContainEqual(
      expect.objectContaining({ code: "SHORT_SLEEP_DAY", dayIndex: 5 }),
    );
    const sleep = sleepOf(day);
    expect(sleep !== undefined && minutes(sleep)).toBe(240);
    const nap = day?.blocks.find((b) => b.kind === "NAP");
    expect(nap !== undefined && minutes(nap)).toBe(20);
    // The event ends at wake, where the advance light block starts; the nap
    // goes right after the light block, never inside it (§2.5).
    const seek = day?.blocks.find((b) => b.kind === "SEEK_LIGHT");
    expect(seek?.startUtc).toBe(eventEnd);
    expect(nap?.startUtc).toBe(seek?.endUtc);
  });

  it("under 4 h of sleep the nap is 90 min", () => {
    const nap = clippedPlan(3).plan.days[5]?.blocks.find(
      (b) => b.kind === "NAP",
    );
    expect(nap !== undefined && minutes(nap)).toBe(90);
  });

  it("an event at the start of the night: the nap follows the remaining sleep", () => {
    const base = generatePlan(prgTyo());
    const sleep = sleepOf(base.days[5]);
    if (sleep === undefined) throw new Error("fixture: no sleep on day 5");
    const eventEnd = Temporal.Instant.from(sleep.startUtc)
      .add({ hours: 4 })
      .toString();
    const plan = generatePlan(
      prgTyo({
        constraints: {
          mustBeAwake: [
            {
              start: local(sleep.startUtc, "Asia/Tokyo"),
              end: local(eventEnd, "Asia/Tokyo"),
              tz: "Asia/Tokyo",
              label: "Late dinner",
            },
          ],
        },
      }),
    );
    const day = plan.days[5];
    const kept = sleepOf(day);
    expect(kept?.startUtc).toBe(eventEnd);
    const nap = day?.blocks.find((b) => b.kind === "NAP");
    expect(nap).toBeDefined();
    expect(Date.parse(nap?.startUtc ?? "")).toBeGreaterThanOrEqual(
      Date.parse(kept?.endUtc ?? ""),
    );
  });

  it("a melatonin window that clashes with an event moves to its end", () => {
    const input = prgTyo({ traveler: { useMelatonin: true } });
    const window = generatePlan(input).days[2]?.blocks.find(
      (b) => b.kind === "MELATONIN_WINDOW",
    );
    if (window === undefined) throw new Error("fixture: no melatonin window");
    const end = Temporal.Instant.from(window.startUtc)
      .add({ minutes: 45 })
      .toString();
    input.constraints = {
      mustBeAwake: [
        {
          start: local(window.startUtc, "Asia/Tokyo"),
          end: local(end, "Asia/Tokyo"),
          tz: "Asia/Tokyo",
          label: "Dinner",
        },
      ],
    };
    const plan = generatePlan(input);
    const moved = plan.days[2]?.blocks.find(
      (b) => b.kind === "MELATONIN_WINDOW",
    );
    expect(moved?.startUtc).toBe(end);
    expect(plan.warnings).toContainEqual(
      expect.objectContaining({ code: "MELATONIN_MOVED", dayIndex: 2 }),
    );
  });

  it("noWorkoutWindows remove exercise windows", () => {
    const base = generatePlan(prgTyo());
    const good = base.days[3]?.blocks.find((b) => b.kind === "EXERCISE_GOOD");
    if (good === undefined) throw new Error("fixture: no exercise window");
    const plan = generatePlan(
      prgTyo({
        constraints: {
          noWorkoutWindows: [
            {
              start: local(good.startUtc, "Asia/Tokyo"),
              end: local(good.endUtc, "Asia/Tokyo"),
              tz: "Asia/Tokyo",
            },
          ],
        },
      }),
    );
    expect(kinds(plan.days[3])).not.toContain("EXERCISE_GOOD");
    expect(plan.droppedBlocks).toContainEqual(
      expect.objectContaining({ dayIndex: 3, kind: "EXERCISE_GOOD" }),
    );
  });
});

describe("rule 3: daylight", () => {
  // Helsinki in December: sunrise ≈ 09:20 local.
  const helTyo = trip(
    [
      leg(
        "HEL",
        "HND",
        "2026-12-15T17:00",
        "2026-12-16T12:00",
        "Europe/Helsinki",
        "Asia/Tokyo",
        true,
      ),
    ],
    "Asia/Tokyo",
    {
      homeTz: "Europe/Helsinki",
      traveler: {
        habitualBedtime: "22:00",
        habitualWake: "06:00",
        preAdjustDays: 1,
      },
    },
  );

  it("a seek-light block at 06:00 in Helsinki in December becomes SEEK_LIGHT_ARTIFICIAL", () => {
    const plan = generatePlan(helTyo);
    const day0 = plan.days[0];
    const seek = day0?.blocks.find((b) => b.kind === "SEEK_LIGHT_ARTIFICIAL");
    expect(seek).toBeDefined();
    expect(seek?.localTz).toBe("Europe/Helsinki");
    expect(local(seek?.startUtc ?? "", "Europe/Helsinki")).toBe(
      "2026-12-14T06:00",
    );
    expect(kinds(day0)).not.toContain("SEEK_LIGHT");
    expect(plan.warnings.map((w) => w.code)).not.toContain("DAYLIGHT_UNKNOWN");
  });

  it("avoid-light in darkness is dropped with a keep-lights-dim note", () => {
    const plan = generatePlan(helTyo);
    expect(kinds(plan.days[0])).not.toContain("AVOID_LIGHT");
    expect(
      plan.staticAdvice.filter((a) => a.dayIndex === 0).map((a) => a.text),
    ).toContain(
      "It's dark outside during part of your avoid-light time; keep indoor lights dim.",
    );
  });

  it("without coordinates the rule is skipped and DAYLIGHT_UNKNOWN is raised once", () => {
    const codes = generatePlan(prgTyo()).warnings.map((w) => w.code);
    expect(codes.filter((c) => c === "DAYLIGHT_UNKNOWN")).toHaveLength(1);
  });
});

describe("rule 5: WEAK_DAY", () => {
  // Same trip; one departs at 06:00 so day 0's light falls in the air.
  const at = (departure: string, arrival: string) =>
    trip(
      [leg("PRG", "HND", departure, arrival, "Europe/Prague", "Asia/Tokyo")],
      "Asia/Tokyo",
      { traveler: { exercise: { enabled: false } } },
    );

  it("halves effectiveShiftHours and makes the plan longer", () => {
    const normal = generatePlan(at("2027-01-15T12:00", "2027-01-16T08:00"));
    const weak = generatePlan(at("2027-01-15T06:00", "2027-01-16T02:00"));
    expect(normal.days[0]?.flags).not.toContain("WEAK_DAY");
    expect(normal.days[0]?.effectiveShiftHours).toBe(1);
    expect(weak.days[0]?.flags).toContain("WEAK_DAY");
    expect(weak.days[0]?.effectiveShiftHours).toBe(0.5);
    expect(weak.warnings).toContainEqual(
      expect.objectContaining({ code: "WEAK_DAY", dayIndex: 0 }),
    );
    expect(weak.decision.chosenDays).toBe(normal.decision.chosenDays + 1);
    expect(weak.days.length).toBe(normal.days.length + 1);
  });

  it("a delay plan behind schedule allows late caffeine", () => {
    // PRG→SYD: day 0 is weak (light in the air), so later days catch up.
    const plan = generatePlan(prgSyd());
    expect(plan.days[0]?.flags).toContain("WEAK_DAY");
    const late = plan.days
      .flatMap((d) => d.blocks)
      .filter((b) => b.kind === "CAFFEINE_LATE_OK");
    expect(late.length).toBeGreaterThan(0);
    expect(kinds(plan.days[0])).not.toContain("CAFFEINE_LATE_OK");
  });
});

describe("forecast (§2.8)", () => {
  it("exercise in the zone adds 0.3 h to the forecast, not to the plan", () => {
    const withExercise = generatePlan(prgTyo());
    const without = generatePlan(
      prgTyo({ traveler: { exercise: { enabled: false } } }),
    );
    expect(withExercise.days[3]?.effectiveShiftHours).toBe(1.3);
    expect(without.days[3]?.effectiveShiftHours).toBe(1);
    // Same CBTmin and sleep: the bonus never moves the plan.
    expect(withExercise.days.map((d) => d.cbtMinUtc)).toEqual(
      without.days.map((d) => d.cbtMinUtc),
    );
    expect(withExercise.days[3]?.misalignmentAfter).toBeLessThan(
      without.days[3]?.misalignmentAfter ?? 0,
    );
  });

  it("misalignment ends at zero", () => {
    for (const plan of [generatePlan(prgSfo()), generatePlan(prgTyo())]) {
      expect(plan.days[plan.days.length - 1]?.misalignmentAfter).toBe(0);
    }
  });
});

describe("validation", () => {
  it("rejects bad constraint windows and coordinates", () => {
    const input = prgTyo({
      constraints: {
        mustBeAwake: [
          {
            start: "2027-01-17T10:00",
            end: "2027-01-17T09:00",
            tz: "Asia/Tokyo",
            label: "x",
          },
        ],
      },
    });
    const first = input.itinerary.legs[0];
    if (first !== undefined) first.departureLatLon = { lat: 95, lon: 0 };
    expect(() => generatePlan(input)).toThrow(
      /departureLatLon is not a valid.*mustBeAwake\[0\] ends before it starts/s,
    );
  });
});
