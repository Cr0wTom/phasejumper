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

// What the Today screen shows (§3.1 #4), as a pure function of the plan and
// the current instant, so it is unit-testable and survives tab sleep (the
// screen recomputes from the clock instead of counting down).

import {
  travelerZoneAt,
  type Block,
  type BlockKind,
  type PlanInput,
  type PlanResult,
} from "@phasejumper/engine";
import { Temporal } from "temporal-polyfill";

/** Background windows that span most of the day are never "current" or "next". */
const BACKGROUND: ReadonlySet<BlockKind> = new Set([
  "CAFFEINE_OK",
  "CAFFEINE_LATE_OK",
  "EXERCISE_AVOID",
]);

/** When several blocks overlap, the first in this list is "current". */
const PRIORITY: readonly BlockKind[] = [
  "SLEEP_INFLIGHT",
  "SLEEP",
  "NAP",
  "SEEK_LIGHT",
  "SEEK_LIGHT_ARTIFICIAL",
  "LIGHT_INFLIGHT_WINDOW",
  "AVOID_LIGHT",
  "MELATONIN_WINDOW",
  "EXERCISE_GOOD",
  "EXERCISE_OPTIONAL_WALK",
  "NSDR",
  "WIND_DOWN",
  "CAFFEINE_STOP",
  "MEAL",
];

export interface TimedBlock {
  block: Block;
  dayIndex: number;
  /** Minutes from now: until it ends (current) or until it starts (next). */
  minutes: number;
}

export interface TodayView {
  /** Where the traveler is now. */
  zone: string;
  /** Today's date in that zone (YYYY-MM-DD). */
  date: string;
  phase: "before" | "during" | "after";
  current: TimedBlock | undefined;
  next: TimedBlock | undefined;
}

function minutesBetween(from: Temporal.Instant, to: Temporal.Instant): number {
  return Math.max(0, Math.ceil(to.since(from).total({ unit: "minutes" })));
}

export function todayView(
  input: PlanInput,
  result: PlanResult,
  nowUtc: string,
): TodayView {
  const now = Temporal.Instant.from(nowUtc);
  const zone = travelerZoneAt(input, nowUtc);
  const date = now.toZonedDateTimeISO(zone).toPlainDate().toString();
  const all = result.days.flatMap((day, dayIndex) =>
    day.blocks
      .filter((block) => !BACKGROUND.has(block.kind))
      .map((block) => ({
        block,
        dayIndex,
        start: Temporal.Instant.from(block.startUtc),
        end: Temporal.Instant.from(block.endUtc),
      })),
  );
  const first = all.reduce<Temporal.Instant | undefined>(
    (min, b) =>
      min === undefined || Temporal.Instant.compare(b.start, min) < 0
        ? b.start
        : min,
    undefined,
  );
  const last = all.reduce<Temporal.Instant | undefined>(
    (max, b) =>
      max === undefined || Temporal.Instant.compare(b.end, max) > 0
        ? b.end
        : max,
    undefined,
  );
  const phase =
    first === undefined || Temporal.Instant.compare(now, first) < 0
      ? "before"
      : last !== undefined && Temporal.Instant.compare(now, last) >= 0
        ? "after"
        : "during";

  const active = all
    .filter(
      (b) =>
        Temporal.Instant.compare(b.start, now) <= 0 &&
        Temporal.Instant.compare(now, b.end) < 0,
    )
    .sort(
      (x, y) => PRIORITY.indexOf(x.block.kind) - PRIORITY.indexOf(y.block.kind),
    );
  const upcoming = all
    .filter((b) => Temporal.Instant.compare(b.start, now) > 0)
    .sort(
      (x, y) =>
        Temporal.Instant.compare(x.start, y.start) ||
        PRIORITY.indexOf(x.block.kind) - PRIORITY.indexOf(y.block.kind),
    );
  const cur = active[0];
  const nxt = upcoming[0];
  return {
    zone,
    date,
    phase,
    current:
      cur === undefined
        ? undefined
        : {
            block: cur.block,
            dayIndex: cur.dayIndex,
            minutes: minutesBetween(now, cur.end),
          },
    next:
      nxt === undefined
        ? undefined
        : {
            block: nxt.block,
            dayIndex: nxt.dayIndex,
            minutes: minutesBetween(now, nxt.start),
          },
  };
}
