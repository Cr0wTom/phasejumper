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

import { describe, expect, it, vi } from "vitest";
import { EngineInputError, MELATONIN_REASON, generatePlan } from "../src/index";
import type { Block } from "../src/types";
import { prgSfo, prgSyd, prgTyo } from "./trips";

function blocks(kind: Block["kind"], plan = generatePlan(prgTyo())): Block[] {
  return plan.days.flatMap((d) => d.blocks.filter((b) => b.kind === kind));
}

function localMinutes(b: Block): number {
  const t = new Intl.DateTimeFormat("en-GB", {
    timeZone: b.localTz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(b.startUtc));
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

describe("phase estimate (§2.2)", () => {
  it("a regular 23:00–07:00 sleeper does not trigger PHASE_ESTIMATE_UNCERTAIN", () => {
    const codes = generatePlan(prgTyo()).warnings.map((w) => w.code);
    expect(codes).not.toContain("PHASE_ESTIMATE_UNCERTAIN");
  });

  it("sleep times far from the chronotype estimate trigger it", () => {
    const plan = generatePlan(
      prgTyo({
        traveler: { habitualBedtime: "21:00", habitualWake: "11:00" },
      }),
    );
    expect(plan.warnings.map((w) => w.code)).toContain(
      "PHASE_ESTIMATE_UNCERTAIN",
    );
  });
});

describe("light (§2.5)", () => {
  it("advancing: one 60 min SEEK_LIGHT per shifting day, after wake", () => {
    const plan = generatePlan(prgTyo());
    plan.days.forEach((day, i) => {
      const seek = day.blocks.filter((b) => b.kind === "SEEK_LIGHT");
      const sleep = day.blocks.find((b) => b.kind === "SLEEP");
      const shifting = i < plan.days.length - 1;
      expect(seek).toHaveLength(shifting ? 1 : 0);
      if (seek[0] !== undefined && sleep !== undefined) {
        expect(seek[0].startUtc >= sleep.endUtc).toBe(true);
        expect(Date.parse(seek[0].endUtc) - Date.parse(seek[0].startUtc)).toBe(
          60 * 60_000,
        );
      }
    });
  });

  it("delaying: SEEK_LIGHT slides out of sleep and warns LIGHT_BLOCK_SHIFTED", () => {
    const plan = generatePlan(prgSfo());
    expect(blocks("SEEK_LIGHT", plan)).toHaveLength(5);
    expect(
      plan.warnings.filter((w) => w.code === "LIGHT_BLOCK_SHIFTED"),
    ).toHaveLength(5);
  });

  it("no light block ever overlaps a sleep window", () => {
    for (const plan of [generatePlan(prgSfo()), generatePlan(prgTyo())]) {
      const sleeps = blocks("SLEEP", plan);
      const light = [
        ...blocks("SEEK_LIGHT", plan),
        ...blocks("AVOID_LIGHT", plan),
      ];
      for (const l of light) {
        for (const s of sleeps) {
          expect(l.startUtc < s.endUtc && s.startUtc < l.endUtc).toBe(false);
        }
      }
    }
  });
});

describe("melatonin (§2.5)", () => {
  it("advancing: 30 min windows, never before 13:00 local, fixed copy", () => {
    const windows = blocks(
      "MELATONIN_WINDOW",
      generatePlan(prgTyo({ traveler: { useMelatonin: true } })),
    );
    expect(windows.length).toBeGreaterThan(0);
    for (const w of windows) {
      expect(Date.parse(w.endUtc) - Date.parse(w.startUtc)).toBe(30 * 60_000);
      expect(localMinutes(w)).toBeGreaterThanOrEqual(13 * 60);
      expect(w.reason).toBe(MELATONIN_REASON);
      expect(w.reason).not.toMatch(/\d/);
    }
  });

  it("never appears without useMelatonin or when contraindicated", () => {
    expect(blocks("MELATONIN_WINDOW", generatePlan(prgTyo()))).toHaveLength(0);
    const blocked = generatePlan(
      prgTyo({
        traveler: { useMelatonin: true, melatoninContraindicated: true },
      }),
    );
    expect(blocks("MELATONIN_WINDOW", blocked)).toHaveLength(0);
    // Contraindicated melatonin also does not speed the plan up.
    expect(blocked.decision.daysAdvance).toBe(8);
  });

  it("delaying: off unless allowDelayMelatonin", () => {
    const input = prgSfo({ traveler: { useMelatonin: true } });
    expect(blocks("MELATONIN_WINDOW", generatePlan(input))).toHaveLength(0);
    expect(
      blocks(
        "MELATONIN_WINDOW",
        generatePlan(input, { allowDelayMelatonin: true }),
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe("exercise and caffeine (§2.5)", () => {
  it("no EXERCISE_GOOD within 3 h of the next sleep", () => {
    for (const plan of [generatePlan(prgSfo()), generatePlan(prgTyo())]) {
      const sleeps = blocks("SLEEP", plan).map((s) => Date.parse(s.startUtc));
      for (const g of blocks("EXERCISE_GOOD", plan)) {
        const end = Date.parse(g.endUtc);
        const nextSleep = sleeps.find((s) => s >= end);
        if (nextSleep !== undefined) {
          expect(nextSleep - end).toBeGreaterThanOrEqual(3 * 3600_000);
        }
      }
    }
  });

  it("advancing: caffeine stops by CBTmin + 8 h", () => {
    const plan = generatePlan(prgTyo());
    plan.days.slice(0, -1).forEach((day) => {
      const stop = day.blocks.find((b) => b.kind === "CAFFEINE_STOP");
      expect(stop).toBeDefined();
      if (stop !== undefined) {
        expect(Date.parse(stop.startUtc)).toBeLessThanOrEqual(
          Date.parse(day.cbtMinUtc) + 8 * 3600_000,
        );
      }
    });
  });

  it("toggles off means no layer", () => {
    const plan = generatePlan(
      prgTyo({
        traveler: {
          caffeine: "none",
          exercise: { enabled: false },
          meditation: { enabled: false },
          mealTiming: { enabled: false },
        },
      }),
    );
    const kinds = new Set(
      plan.days.flatMap((d) => d.blocks.map((b) => b.kind)),
    );
    expect([...kinds].sort()).toEqual(["AVOID_LIGHT", "SEEK_LIGHT", "SLEEP"]);
  });
});

describe("contract", () => {
  it("is deterministic and never reads the wall clock", () => {
    const now = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("engine read Date.now");
    });
    try {
      expect(generatePlan(prgSyd())).toEqual(generatePlan(prgSyd()));
    } finally {
      now.mockRestore();
    }
  });

  it("rejects invalid input with every issue listed", () => {
    const input = prgTyo();
    input.itinerary.destinationTz = "Mars/Olympus";
    input.traveler.habitualWake = "7am";
    try {
      generatePlan(input);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EngineInputError);
      if (err instanceof EngineInputError) {
        expect(err.issues).toEqual([
          "traveler.habitualWake must be HH:MM",
          "itinerary.destinationTz is not an IANA zone",
        ]);
      }
    }
  });

  it("stamps the engine version", () => {
    expect(generatePlan(prgTyo()).engineVersion).toBe("0.1.0");
  });
});
