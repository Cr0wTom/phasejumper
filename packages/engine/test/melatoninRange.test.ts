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
  MELATONIN_OK_REASON,
  MELATONIN_REASON,
  MELATONIN_REASON_EVENING,
  MELATONIN_REASON_STRONGEST,
  generatePlan,
  travelerZoneAt,
} from "../src/index";
import { FEASIBILITY, MELATONIN } from "../src/prc";
import type { Block, PlanInput, PlanResult } from "../src/types";
import { leg, prgSfo, prgTyo, trip } from "./trips";

const AMOUNT = /\d+\s*mg/i;

function ms(iso: string): number {
  return Date.parse(iso);
}

function ofKind(plan: PlanResult, kind: Block["kind"]): Block[] {
  return plan.days.flatMap((day) => day.blocks.filter((b) => b.kind === kind));
}

function overlaps(block: Block, start: number, end: number): boolean {
  return ms(block.startUtc) < end && start < ms(block.endUtc);
}

function overlapBlocks(a: Block, b: Block): boolean {
  return overlaps(a, ms(b.startUtc), ms(b.endUtc));
}

/** 13:00 local floor of sleep − rangeBeforeSleepHours, in the zone at that instant. */
function rangeFloorMs(input: PlanInput, sleepStartUtc: string): number {
  const unfloored = Temporal.Instant.from(sleepStartUtc).subtract({
    minutes: Math.round(MELATONIN.rangeBeforeSleepHours * 60),
  });
  const zone = travelerZoneAt(input, unfloored.toString());
  const local = unfloored.toZonedDateTimeISO(zone);
  const [hour, minute] = MELATONIN.earliestLocalTime.split(":").map(Number);
  const earliest = (hour ?? 0) * 60 + (minute ?? 0);
  if (local.hour * 60 + local.minute < earliest) {
    return local
      .toPlainDate()
      .toZonedDateTime(zone)
      .add({ minutes: earliest })
      .toInstant().epochMilliseconds;
  }
  return unfloored.epochMilliseconds;
}

function travelWindows(input: PlanInput): Array<{ s: number; e: number }> {
  const legs = input.itinerary.legs.map((flight) => ({
    s: Temporal.PlainDateTime.from(flight.departureLocal)
      .toZonedDateTime(flight.departureTz)
      .toInstant(),
    e: Temporal.PlainDateTime.from(flight.arrivalLocal)
      .toZonedDateTime(flight.arrivalTz)
      .toInstant(),
  }));
  const out: Array<{ s: number; e: number }> = [];
  legs.forEach((flight, index) => {
    const previous = legs[index - 1];
    const connecting =
      previous !== undefined &&
      flight.s.since(previous.e).total("hours") <
        FEASIBILITY.connectionMaxHours;
    const before = connecting
      ? FEASIBILITY.awakeBeforeConnectionMinutes
      : FEASIBILITY.awakeBeforeDepartureHours * 60;
    out.push({
      s: flight.s.subtract({ minutes: before }).epochMilliseconds,
      e: flight.s.epochMilliseconds,
    });
    out.push({
      s: flight.e.epochMilliseconds,
      e: flight.e.add({ minutes: FEASIBILITY.awakeAfterArrivalMinutes })
        .epochMilliseconds,
    });
  });
  return out;
}

function local(utc: string, tz: string): string {
  return Temporal.Instant.from(utc)
    .toZonedDateTimeISO(tz)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}

describe("melatonin range (MEL-RANGE)", () => {
  it("keeps every best time inside the range on an advancing trip", () => {
    const input = prgTyo({ traveler: { useMelatonin: true } });
    const plan = generatePlan(input);
    const windows = ofKind(plan, "MELATONIN_WINDOW");
    expect(windows.length).toBeGreaterThan(0);
    let checked = 0;
    plan.days.forEach((day) => {
      const wind = day.blocks.find((b) => b.kind === "WIND_DOWN");
      const dayWindows = day.blocks.filter(
        (b) => b.kind === "MELATONIN_WINDOW",
      );
      if (wind === undefined || dayWindows.length === 0) return;
      const sleepStart = ms(wind.endUtc);
      const floor = rangeFloorMs(input, wind.endUtc);
      for (const window of dayWindows) {
        expect(ms(window.endUtc)).toBeLessThanOrEqual(sleepStart);
        expect(ms(window.startUtc)).toBeGreaterThanOrEqual(floor);
        expect(ms(window.endUtc) - ms(window.startUtc)).toBe(
          MELATONIN.windowMinutes * 60_000,
        );
        checked += 1;
      }
    });
    expect(checked).toBe(windows.length);
  });

  it("starts the best time at sleep − 5.5 h or 4.5 h when nothing collides", () => {
    const strongest = generatePlan(
      prgTyo({
        traveler: { useMelatonin: true, melatoninTiming: "strongest" },
      }),
    );
    const omitted = generatePlan(prgTyo({ traveler: { useMelatonin: true } }));
    const evening = generatePlan(
      prgTyo({ traveler: { useMelatonin: true, melatoninTiming: "evening" } }),
    );
    const offsets = (plan: PlanResult): number[] => {
      const found: number[] = [];
      plan.days.forEach((day, dayIndex) => {
        const moved = plan.warnings.some(
          (warning) =>
            warning.code === "MELATONIN_MOVED" && warning.dayIndex === dayIndex,
        );
        if (moved) return;
        const wind = day.blocks.find((b) => b.kind === "WIND_DOWN");
        const window = day.blocks.find((b) => b.kind === "MELATONIN_WINDOW");
        if (wind === undefined || window === undefined) return;
        found.push((ms(wind.endUtc) - ms(window.startUtc)) / 3_600_000);
      });
      return found;
    };
    expect(offsets(strongest)).toContain(MELATONIN.advanceBeforeSleepHours);
    expect(offsets(omitted)).toContain(MELATONIN.advanceBeforeSleepHours);
    expect(offsets(evening)).toContain(MELATONIN.eveningBeforeSleepHours);
    for (const window of ofKind(strongest, "MELATONIN_WINDOW")) {
      expect(window.reason).toBe(MELATONIN_REASON_STRONGEST);
      expect(window.reasonCode).toBe("MELATONIN_WINDOW");
      expect(window.reason).not.toMatch(AMOUNT);
    }
    for (const window of ofKind(evening, "MELATONIN_WINDOW")) {
      expect(window.reason).toBe(MELATONIN_REASON_EVENING);
      expect(window.reasonCode).toBe("MELATONIN_WINDOW_EVENING");
      expect(window.reason).not.toMatch(AMOUNT);
    }
  });

  it("never lets the range overlap the best time, sleep, or travel", () => {
    const input = prgTyo({ traveler: { useMelatonin: true } });
    const plan = generatePlan(input);
    const pieces = ofKind(plan, "MELATONIN_OK");
    expect(pieces.length).toBeGreaterThan(0);
    const windows = ofKind(plan, "MELATONIN_WINDOW");
    const sleeps = plan.days
      .flatMap((day) => day.blocks)
      .filter((b) => b.kind === "SLEEP" || b.kind === "SLEEP_INFLIGHT");
    for (const piece of pieces) {
      expect(piece.reason).toBe(MELATONIN_OK_REASON);
      expect(piece.reason).not.toMatch(AMOUNT);
      for (const window of windows)
        expect(overlapBlocks(piece, window)).toBe(false);
      for (const sleep of sleeps)
        expect(overlapBlocks(piece, sleep)).toBe(false);
      for (const span of travelWindows(input)) {
        expect(overlaps(piece, span.s, span.e)).toBe(false);
      }
    }
  });

  it("shows neither kind when melatonin is off or contraindicated", () => {
    for (const input of [
      prgTyo(),
      prgTyo({
        traveler: { useMelatonin: true, melatoninContraindicated: true },
      }),
    ]) {
      const plan = generatePlan(input);
      expect(ofKind(plan, "MELATONIN_OK")).toEqual([]);
      expect(ofKind(plan, "MELATONIN_WINDOW")).toEqual([]);
    }
    const blocked = generatePlan(
      prgTyo({
        traveler: { useMelatonin: true, melatoninContraindicated: true },
      }),
    );
    expect(blocked.decision.daysAdvance).toBe(8);
  });

  it("moves a best time that falls in the 3 h before departure, or drops it", () => {
    const input = trip(
      [
        leg(
          "PRG",
          "HND",
          "2027-01-15T18:00",
          "2027-01-16T13:00",
          "Europe/Prague",
          "Asia/Tokyo",
        ),
      ],
      "Asia/Tokyo",
      { traveler: { useMelatonin: true } },
    );
    const plan = generatePlan(input);
    const departure = Temporal.PlainDateTime.from("2027-01-15T18:00")
      .toZonedDateTime("Europe/Prague")
      .toInstant();
    const preStart = departure.subtract({ hours: 3 }).epochMilliseconds;
    const preEnd = departure.epochMilliseconds;
    const windows = ofKind(plan, "MELATONIN_WINDOW");
    for (const window of windows) {
      expect(overlaps(window, preStart, preEnd)).toBe(false);
    }
    const movedToDeparture = windows.some(
      (window) => ms(window.startUtc) === preEnd,
    );
    const dropped = plan.droppedBlocks.some(
      (block) =>
        block.kind === "MELATONIN_WINDOW" &&
        block.reason ===
          "No melatonin window today: the useful time falls too close to your sleep.",
    );
    expect(movedToDeparture || dropped).toBe(true);
    expect(ofKind(plan, "MELATONIN_OK").length).toBeGreaterThan(0);
    for (const piece of ofKind(plan, "MELATONIN_OK")) {
      expect(overlaps(piece, preStart, preEnd)).toBe(false);
    }
  });

  it("still shows the range when the best time is dropped", () => {
    const input = prgTyo({ traveler: { useMelatonin: true } });
    const base = generatePlan(input);
    const day = base.days.find(
      (candidate) =>
        candidate.blocks.some((b) => b.kind === "MELATONIN_WINDOW") &&
        candidate.blocks.some((b) => b.kind === "WIND_DOWN"),
    );
    const window = day?.blocks.find((b) => b.kind === "MELATONIN_WINDOW");
    const wind = day?.blocks.find((b) => b.kind === "WIND_DOWN");
    if (day === undefined || window === undefined || wind === undefined) {
      throw new Error("fixture: no melatonin day");
    }
    input.constraints = {
      mustBeAwake: [
        {
          start: local(window.startUtc, window.localTz),
          end: local(wind.endUtc, window.localTz),
          tz: window.localTz,
          label: "Awake",
        },
      ],
    };
    const plan = generatePlan(input);
    const after = plan.days.find((candidate) => candidate.date === day.date);
    expect(after?.blocks.some((b) => b.kind === "MELATONIN_WINDOW")).toBe(
      false,
    );
    expect(after?.blocks.some((b) => b.kind === "MELATONIN_OK")).toBe(true);
    expect(
      plan.droppedBlocks.some((block) => block.kind === "MELATONIN_WINDOW"),
    ).toBe(true);
  });

  it("has no range when delaying, and keeps the delay sentence", () => {
    const input = prgSfo({ traveler: { useMelatonin: true } });
    expect(ofKind(generatePlan(input), "MELATONIN_OK")).toEqual([]);
    const plan = generatePlan(input, { allowDelayMelatonin: true });
    expect(ofKind(plan, "MELATONIN_OK")).toEqual([]);
    const windows = ofKind(plan, "MELATONIN_WINDOW");
    expect(windows.length).toBeGreaterThan(0);
    for (const window of windows) {
      expect(window.reason).toBe(MELATONIN_REASON);
      expect(window.reasonCode).toBe("MELATONIN_WINDOW_DELAY");
      expect(window.reason).not.toMatch(AMOUNT);
    }
  });

  it("uses the same forecast for both best times", () => {
    const omitted = generatePlan(prgTyo({ traveler: { useMelatonin: true } }));
    const strongest = generatePlan(
      prgTyo({
        traveler: { useMelatonin: true, melatoninTiming: "strongest" },
      }),
    );
    const evening = generatePlan(
      prgTyo({ traveler: { useMelatonin: true, melatoninTiming: "evening" } }),
    );
    const shifts = (plan: PlanResult): number[] =>
      plan.days.map((day) => day.effectiveShiftHours);
    expect(strongest.decision.daysAdvance).toBe(omitted.decision.daysAdvance);
    expect(evening.decision.daysAdvance).toBe(omitted.decision.daysAdvance);
    expect(shifts(strongest)).toEqual(shifts(omitted));
    expect(shifts(evening)).toEqual(shifts(omitted));
  });
});
