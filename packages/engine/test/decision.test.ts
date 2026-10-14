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
import { generatePlan } from "../src/index";
import { leg, prgLhr, prgSfo, prgSyd, prgTyo, trip } from "./trips";

// T03 acceptance: direction choice (§2.3–2.4).
describe("decision", () => {
  it("PRG→SFO (−9 h) delays", () => {
    const { decision } = generatePlan(prgSfo());
    expect(decision).toMatchObject({
      direction: "delay",
      deltaHours: -9,
      daysDelay: 5,
      daysAdvance: 15,
      chosenDays: 5,
    });
  });

  it("PRG→TYO (+8 h) ties 8 vs 8 days and advances", () => {
    const { decision } = generatePlan(prgTyo());
    expect(decision).toMatchObject({
      direction: "advance",
      deltaHours: 8,
      daysAdvance: 8,
      daysDelay: 8,
      chosenDays: 8,
    });
  });

  it("PRG→SYD (+9 h) delays the long way: 8 days vs 9", () => {
    const { decision } = generatePlan(prgSyd());
    expect(decision).toMatchObject({
      direction: "delay",
      deltaHours: 9,
      daysAdvance: 9,
      daysDelay: 8,
      chosenDays: 8,
    });
    expect(decision.explanation).toBe(
      "We'll move your clock 15 h later instead of 9 h earlier because it finishes 1 day sooner.",
    );
  });

  it("PRG→LHR (−1 h) has no shifting plan", () => {
    const plan = generatePlan(prgLhr());
    expect(plan.decision.direction).toBe("none");
    expect(plan.days).toHaveLength(1);
    const kinds = plan.days.flatMap((d) => d.blocks.map((b) => b.kind));
    expect(kinds).not.toContain("SEEK_LIGHT");
    expect(kinds).not.toContain("AVOID_LIGHT");
    expect(kinds).not.toContain("MELATONIN_WINDOW");
    expect(kinds).not.toContain("MELATONIN_OK");
  });

  it("PRG→SFO with tripDays 2 is short-trip, on home time", () => {
    const plan = generatePlan(prgSfo({ tripDays: 2 }));
    expect(plan.decision).toMatchObject({
      direction: "short-trip",
      daysDelay: 5,
      chosenDays: 2,
      explanation:
        "Your trip is 2 days and shifting would take 5 days, so the plan keeps you on home time. You can switch to a full shift.",
    });
    expect(plan.days).toHaveLength(3);
    const sleeps = plan.days.flatMap((d) =>
      d.blocks.filter((b) => b.kind === "SLEEP"),
    );
    // 23:00–07:00 Prague every night, except the landing night: the flight
    // lands 22:05 Prague and bed is at least two hours after landing.
    for (const s of sleeps) {
      expect(s.startUtc.slice(11)).toBe(
        s.startUtc.startsWith("2027-01-15") ? "23:05:00Z" : "22:00:00Z",
      );
      expect(s.endUtc.slice(11)).toBe("06:00:00Z");
    }
  });

  it("trips of 2 days or less are short-trip even when the shift is quicker", () => {
    // −2 h would take 1 day to delay; the 2-day floor still applies (§2.3).
    const { decision } = generatePlan(prgLhr({ tripDays: 2 }), {});
    expect(decision.direction).toBe("none");
    const plan = generatePlan(
      trip(
        [
          leg(
            "SYD",
            "HND",
            "2027-01-15T09:00",
            "2027-01-15T17:00",
            "Australia/Sydney",
            "Asia/Tokyo",
          ),
        ],
        "Asia/Tokyo",
        { homeTz: "Australia/Sydney", tripDays: 2 },
      ),
    );
    expect(plan.decision).toMatchObject({
      direction: "short-trip",
      deltaHours: -2,
      daysDelay: 1,
      chosenDays: 2,
      explanation:
        "Your trip is 2 days, too short to be worth shifting your clock, so the plan keeps you on home time. You can switch to a full shift.",
    });
  });

  it("melatonin raises the advance rate to 1.5 h/day", () => {
    const { decision } = generatePlan(
      prgTyo({ traveler: { useMelatonin: true } }),
    );
    expect(decision).toMatchObject({ direction: "advance", daysAdvance: 6 });
  });

  it("forceDirection overrides the choice and says so", () => {
    const { decision } = generatePlan(prgSyd(), { forceDirection: "advance" });
    // 9 days by formula; the second flight day is a WEAK_DAY (light falls
    // in the air), which adds a day (§2.7 rule 5).
    expect(decision).toMatchObject({
      direction: "advance",
      daysAdvance: 9,
      chosenDays: 10,
    });
    expect(decision.explanation).toBe(
      "You chose to move your clock 9 h earlier over 10 days.",
    );
  });

  it("forceDirection also overrides short-trip", () => {
    const { decision } = generatePlan(prgSfo({ tripDays: 2 }), {
      forceDirection: "delay",
    });
    expect(decision.direction).toBe("delay");
  });

  it("reports the target CBTmin in destination wall time", () => {
    expect(generatePlan(prgTyo()).decision.targetCbtMinLocal).toBe("04:30");
  });

  it("a DST change at the destination is absorbed and the plan converges", () => {
    // New York → London across the 2027-03-28 EU change (+5 h → +4 h).
    const plan = generatePlan(
      trip(
        [
          leg(
            "JFK",
            "LHR",
            "2027-03-25T19:00",
            "2027-03-26T07:00",
            "America/New_York",
            "Europe/London",
          ),
        ],
        "Europe/London",
        { homeTz: "America/New_York" },
      ),
    );
    expect(plan.decision.direction).toBe("advance");
    const last = plan.days[plan.days.length - 1];
    expect(last?.misalignmentAfter).toBe(0);
  });
});
