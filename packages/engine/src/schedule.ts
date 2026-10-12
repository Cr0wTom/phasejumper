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

// §2.6 day loop. Unfiltered: flights, must-be-awake, daylight and block
// collisions are the feasibility pass (T04).
//
// Day d = the main sleep that contains CBTmin_d, then the waking period up to
// the next sleep. Morning blocks are placed from CBTmin_d; evening blocks from
// the next night's CBTmin and sleep start (the spec's "sleepStart_d" for that
// evening).

import { Temporal } from "temporal-polyfill";
import { droppedCopy, explanationCopy, reasonCopy, warningCopy } from "./copy";
import {
  CAFFEINE,
  EXERCISE,
  LIGHT,
  MARKER_MINUTES,
  MEALS,
  MELATONIN,
  WIND_DOWN,
} from "./prc";
import {
  EngineInputError,
  MINUTES_PER_DAY,
  chooseDirection,
  clockIn,
  estimatePhase,
  formatClock,
  instantAt,
  legInstants,
  offsetMinutes,
  parseClock,
  ratesFor,
  signedMinutes,
  validatePlanInput,
  type DirectionDecision,
  type PhaseEstimate,
} from "./phase";
import type {
  Block,
  BlockKind,
  Decision,
  Direction,
  EngineOptions,
  EvidenceGrade,
  PlanDay,
  PlanInput,
  PlanResult,
  PlanWarning,
  ReasonCode,
  SourceRef,
} from "./types";

export const ENGINE_VERSION = "0.1.0";

/** Guard against a non-terminating loop; no real plan comes close. */
const MAX_SHIFT_DAYS = 40;

type Instant = Temporal.Instant;

const META: Record<
  BlockKind,
  { source: SourceRef; confidence: EvidenceGrade; movable: boolean }
> = {
  SLEEP: { source: "R1", confidence: "A", movable: false },
  SEEK_LIGHT: { source: "R2", confidence: "A", movable: false },
  AVOID_LIGHT: { source: "R2", confidence: "A", movable: false },
  MELATONIN_WINDOW: { source: "R4", confidence: "A", movable: true },
  EXERCISE_GOOD: { source: "R9", confidence: "B", movable: true },
  EXERCISE_AVOID: { source: "R9", confidence: "B", movable: false },
  CAFFEINE_OK: { source: "R10", confidence: "B", movable: false },
  CAFFEINE_STOP: { source: "R11", confidence: "B", movable: false },
  MEAL: { source: "none", confidence: "C", movable: true },
  WIND_DOWN: { source: "none", confidence: "C", movable: true },
};

function plus(instant: Instant, minutes: number): Instant {
  return instant.add({ minutes });
}

function minutesBetween(a: Instant, b: Instant): number {
  return Math.round(b.since(a).total({ unit: "minutes" }));
}

function earlier(a: Instant, b: Instant): Instant {
  return Temporal.Instant.compare(a, b) <= 0 ? a : b;
}

function later(a: Instant, b: Instant): Instant {
  return Temporal.Instant.compare(a, b) >= 0 ? a : b;
}

function overlaps(
  aStart: Instant,
  aEnd: Instant,
  bStart: Instant,
  bEnd: Instant,
): boolean {
  return (
    Temporal.Instant.compare(aStart, bEnd) < 0 &&
    Temporal.Instant.compare(bStart, aEnd) < 0
  );
}

/** Where the traveler is: home, a leg's departure zone in the air, a layover, the destination. */
function locator(input: PlanInput): (at: Instant) => string {
  const legs = legInstants(input);
  return (at) => {
    let zone = input.itinerary.homeTz;
    for (const leg of legs) {
      if (Temporal.Instant.compare(at, leg.dep) < 0) return zone;
      if (Temporal.Instant.compare(at, leg.arr) < 0) return leg.depTz;
      zone = leg.arrTz;
    }
    return input.itinerary.destinationTz;
  };
}

interface DayFrame {
  index: number;
  cbtMin: Instant;
  nextCbtMin: Instant;
  /** Shift applied from this day to the next, minutes (0 on settled days). */
  shift: number;
}

interface Builder {
  blocks: Block[];
  warnings: PlanWarning[];
  dropped: PlanResult["droppedBlocks"];
  zoneAt: (at: Instant) => string;
}

function addBlock(
  b: Builder,
  kind: BlockKind,
  start: Instant,
  end: Instant,
  reasonCode: ReasonCode,
): void {
  if (minutesBetween(start, end) <= 0) return;
  b.blocks.push({
    kind,
    startUtc: start.toString(),
    endUtc: end.toString(),
    localTz: b.zoneAt(start),
    reasonCode,
    reason: reasonCopy(reasonCode),
    ...META[kind],
  });
}

function wakeOf(cbtMin: Instant, phase: PhaseEstimate): Instant {
  return plus(cbtMin, phase.wakeAfterCbtMin);
}

function sleepStartOf(cbtMin: Instant, phase: PhaseEstimate): Instant {
  return plus(wakeOf(cbtMin, phase), -phase.sleepNeedMinutes);
}

function lightBlocks(
  b: Builder,
  day: DayFrame,
  direction: Direction,
  phase: PhaseEstimate,
): void {
  const wake = wakeOf(day.cbtMin, phase);
  const nextSleep = sleepStartOf(day.nextCbtMin, phase);
  const nextWake = wakeOf(day.nextCbtMin, phase);
  const u = phase.uncertaintyMinutes;
  if (direction === "advance") {
    const seekStart = later(
      plus(day.cbtMin, LIGHT.seekAdvanceStartHours * 60),
      wake,
    );
    addBlock(
      b,
      "SEEK_LIGHT",
      seekStart,
      plus(seekStart, Math.min(LIGHT.seekMinutes, LIGHT.maxBlockMinutes)),
      "SEEK_LIGHT_ADVANCE",
    );
    // Evening before the next sleep: the delay zone, widened by u past the
    // crossover, awake part only.
    const [from, to] = LIGHT.avoidWhenAdvancing;
    addBlock(
      b,
      "AVOID_LIGHT",
      later(plus(day.nextCbtMin, from * 60), wake),
      earlier(plus(day.nextCbtMin, to * 60 + u), nextSleep),
      "AVOID_LIGHT_ADVANCE",
    );
    return;
  }
  // Delaying: seek light late in the evening, before the next CBTmin.
  const seekEnd = plus(day.nextCbtMin, LIGHT.seekDelayEndHours * 60);
  let seekStart = plus(seekEnd, -LIGHT.seekMinutes);
  let seekStop = seekEnd;
  if (overlaps(seekStart, seekStop, nextSleep, nextWake)) {
    seekStart = plus(nextSleep, -LIGHT.seekMinutes);
    seekStop = nextSleep;
    b.warnings.push({
      code: "LIGHT_BLOCK_SHIFTED",
      message: warningCopy("LIGHT_BLOCK_SHIFTED"),
      dayIndex: day.index,
    });
  }
  addBlock(b, "SEEK_LIGHT", seekStart, seekStop, "SEEK_LIGHT_DELAY");
  // Morning after this sleep: the advance zone, widened by u, awake part only.
  const [from, to] = LIGHT.avoidWhenDelaying;
  addBlock(
    b,
    "AVOID_LIGHT",
    later(plus(day.cbtMin, from * 60 - u), wake),
    earlier(plus(day.cbtMin, to * 60), nextSleep),
    "AVOID_LIGHT_DELAY",
  );
}

function melatoninBlock(
  b: Builder,
  day: DayFrame,
  direction: Direction,
  phase: PhaseEstimate,
  opts: EngineOptions,
): void {
  if (direction === "delay") {
    if (opts.allowDelayMelatonin !== true) return;
    const wake = wakeOf(day.cbtMin, phase);
    addBlock(
      b,
      "MELATONIN_WINDOW",
      wake,
      plus(wake, MELATONIN.delayAfterWakeMinutes),
      "MELATONIN_WINDOW",
    );
    return;
  }
  const nextSleep = sleepStartOf(day.nextCbtMin, phase);
  let start = plus(nextSleep, -MELATONIN.advanceBeforeSleepHours * 60);
  const zone = b.zoneAt(start);
  const local = start.toZonedDateTimeISO(zone);
  const earliest = parseClock(MELATONIN.earliestLocalTime) ?? 0;
  if (local.hour * 60 + local.minute < earliest) {
    start = instantAt(local.toPlainDate(), earliest, zone);
  }
  const end = plus(start, MELATONIN.windowMinutes);
  if (Temporal.Instant.compare(end, nextSleep) > 0) {
    b.dropped.push({
      dayIndex: day.index,
      kind: "MELATONIN_WINDOW",
      reason: droppedCopy("MELATONIN_NO_WINDOW"),
    });
    return;
  }
  addBlock(b, "MELATONIN_WINDOW", start, end, "MELATONIN_WINDOW");
}

function exerciseBlocks(
  b: Builder,
  day: DayFrame,
  direction: Direction,
  phase: PhaseEstimate,
  preferredMinutes: number,
  shifting: boolean,
): void {
  const wake = wakeOf(day.cbtMin, phase);
  const nextSleep = sleepStartOf(day.nextCbtMin, phase);
  const bedtimeAvoid = plus(nextSleep, -EXERCISE.avoidBeforeSleepHours * 60);
  addBlock(
    b,
    "EXERCISE_AVOID",
    later(bedtimeAvoid, wake),
    nextSleep,
    "EXERCISE_AVOID_BEDTIME",
  );
  if (!shifting) return;

  const at = (hours: number): Instant => plus(day.cbtMin, hours * 60);
  const awakeBeforeBedtimeAvoid = (
    start: Instant,
    end: Instant,
  ): [Instant, Instant] => [later(start, wake), earlier(end, bedtimeAvoid)];

  const good =
    direction === "advance"
      ? [EXERCISE.advanceAfternoonZone, EXERCISE.advanceMorningZone]
      : [EXERCISE.delayZone];
  for (const [from, to] of good) {
    const [start, zoneEnd] = awakeBeforeBedtimeAvoid(at(from), at(to));
    const end = earlier(plus(start, preferredMinutes), zoneEnd);
    if (minutesBetween(start, end) > 0) {
      addBlock(
        b,
        "EXERCISE_GOOD",
        start,
        end,
        direction === "advance"
          ? "EXERCISE_GOOD_ADVANCE"
          : "EXERCISE_GOOD_DELAY",
      );
      break;
    }
  }
  const opposite =
    direction === "advance"
      ? [EXERCISE.delayZone]
      : [EXERCISE.advanceMorningZone, EXERCISE.advanceAfternoonZone];
  for (const [from, to] of opposite) {
    const [start, end] = awakeBeforeBedtimeAvoid(at(from), at(to));
    addBlock(b, "EXERCISE_AVOID", start, end, "EXERCISE_AVOID_DIRECTION");
  }
}

function symptomBlocks(
  b: Builder,
  day: DayFrame,
  phase: PhaseEstimate,
  input: PlanInput,
  advancing: boolean,
): void {
  const t = input.traveler;
  const wake = wakeOf(day.cbtMin, phase);
  const nextSleep = sleepStartOf(day.nextCbtMin, phase);

  if (t.caffeine !== "none") {
    let stop = plus(nextSleep, -CAFFEINE.stopBeforeSleepHours[t.caffeine] * 60);
    if (advancing) {
      stop = earlier(
        stop,
        plus(day.cbtMin, CAFFEINE.advanceStopAfterCbtMinHours * 60),
      );
    }
    if (Temporal.Instant.compare(stop, wake) > 0) {
      addBlock(b, "CAFFEINE_OK", wake, stop, "CAFFEINE_OK");
      addBlock(
        b,
        "CAFFEINE_STOP",
        stop,
        plus(stop, MARKER_MINUTES),
        "CAFFEINE_STOP",
      );
    }
  }

  if (t.mealTiming.enabled) {
    const awake = minutesBetween(wake, nextSleep);
    for (const at of [
      plus(wake, MEALS.afterWakeHours * 60),
      plus(wake, Math.round(awake / 2)),
      plus(nextSleep, -MEALS.lastBeforeSleepHours * 60),
    ]) {
      addBlock(b, "MEAL", at, plus(at, MARKER_MINUTES), "MEAL");
    }
  }

  if (t.meditation.enabled) {
    const minutes = Math.round(
      t.meditation.minutes ?? WIND_DOWN.defaultMinutes,
    );
    addBlock(
      b,
      "WIND_DOWN",
      later(plus(nextSleep, -minutes), wake),
      nextSleep,
      "WIND_DOWN",
    );
  }
}

function sortBlocks(blocks: Block[]): Block[] {
  return [...blocks].sort(
    (x, y) =>
      Temporal.Instant.compare(
        Temporal.Instant.from(x.startUtc),
        Temporal.Instant.from(y.startUtc),
      ) || x.kind.localeCompare(y.kind),
  );
}

/** CBTmin of each day while shifting, then one settled day (§2.6). */
function shiftFrames(
  cbtMin0: Instant,
  decision: DirectionDecision,
  destinationTz: string,
): DayFrame[] {
  const direction = decision.shiftDirection;
  const rate = decision.rateMinutes[direction];
  const sign = direction === "advance" ? -1 : 1;
  let remaining =
    direction === "advance" ? decision.advanceMinutes : decision.delayMinutes;
  const frames: DayFrame[] = [];
  let cbtMin = cbtMin0;
  while (remaining > 0) {
    if (frames.length >= MAX_SHIFT_DAYS) {
      throw new Error(
        `engine invariant: shift did not converge within ${MAX_SHIFT_DAYS} days`,
      );
    }
    const shift = Math.min(rate, remaining);
    const next = plus(cbtMin, MINUTES_PER_DAY + sign * shift);
    // A DST change at the destination moves the target in UTC.
    const offsetChange =
      offsetMinutes(next, destinationTz) - offsetMinutes(cbtMin, destinationTz);
    remaining = Math.max(0, remaining - shift - sign * offsetChange);
    frames.push({ index: frames.length, cbtMin, nextCbtMin: next, shift });
    cbtMin = next;
  }
  frames.push({
    index: frames.length,
    cbtMin,
    nextCbtMin: plus(cbtMin, MINUTES_PER_DAY),
    shift: 0,
  });
  return frames;
}

/** Same CBTmin every day (no shift). */
function steadyFrames(cbtMin0: Instant, count: number): DayFrame[] {
  return Array.from({ length: count }, (_, index) => {
    const cbtMin = plus(cbtMin0, index * MINUTES_PER_DAY);
    return {
      index,
      cbtMin,
      nextCbtMin: plus(cbtMin, MINUTES_PER_DAY),
      shift: 0,
    };
  });
}

function explanation(
  decision: DirectionDecision,
  chosenDays: number,
  tripDays: number | undefined,
): string {
  if (decision.direction === "none") {
    return explanationCopy.lightTouch(decision.deltaMinutes / 60);
  }
  if (decision.direction === "short-trip") {
    return explanationCopy.shortTrip({
      tripDays: tripDays ?? 0,
      shiftDays:
        decision.shiftDirection === "advance"
          ? decision.daysAdvance
          : decision.daysDelay,
    });
  }
  const advance = decision.shiftDirection === "advance";
  return explanationCopy.shift({
    direction: decision.shiftDirection,
    shiftHours:
      (advance ? decision.advanceMinutes : decision.delayMinutes) / 60,
    days: chosenDays,
    otherShiftHours:
      (advance ? decision.delayMinutes : decision.advanceMinutes) / 60,
    otherDays: advance ? decision.daysDelay : decision.daysAdvance,
    forced: decision.forced,
  });
}

/** The engine's one public entry point. Pure and deterministic. */
export function generatePlan(
  input: PlanInput,
  opts: EngineOptions = {},
): PlanResult {
  const valid = validatePlanInput(input);
  if (!valid.ok) throw new EngineInputError(valid.issues);

  const { traveler, itinerary } = input;
  const phase = estimatePhase(traveler);
  const legs = legInstants(input);
  const firstLeg = legs[0];
  const lastLeg = legs[legs.length - 1];
  if (firstLeg === undefined || lastLeg === undefined) {
    throw new EngineInputError(["itinerary.legs must not be empty"]);
  }
  const departureDate = firstLeg.dep
    .toZonedDateTimeISO(itinerary.homeTz)
    .toPlainDate();
  const destinationTz = itinerary.destinationTz;
  const target = phase.cbtMinClock;

  // §2.3: delta from CBTmin on the first planned day, read in destination time.
  const firstDay = departureDate.subtract({ days: traveler.preAdjustDays });
  const cbtMin0 = instantAt(firstDay, target, itinerary.homeTz);
  const deltaMinutes = signedMinutes(clockIn(cbtMin0, destinationTz) - target);
  const decision = chooseDirection(
    deltaMinutes,
    ratesFor(traveler),
    itinerary.tripDays,
    opts,
  );

  const builder: Builder = {
    blocks: [],
    warnings: [],
    dropped: [],
    zoneAt: locator(input),
  };
  if (phase.uncertain) {
    builder.warnings.push({
      code: "PHASE_ESTIMATE_UNCERTAIN",
      message: warningCopy("PHASE_ESTIMATE_UNCERTAIN"),
    });
  }

  let frames: DayFrame[];
  let sleepReason: (frame: DayFrame) => ReasonCode;
  if (decision.direction === "none") {
    // One day: the first night on destination time after the final arrival.
    const arrival = lastLeg.arr.toZonedDateTimeISO(destinationTz);
    let cbtMin = instantAt(arrival.toPlainDate(), target, destinationTz);
    if (Temporal.Instant.compare(cbtMin, lastLeg.arr) < 0) {
      cbtMin = instantAt(
        arrival.toPlainDate().add({ days: 1 }),
        target,
        destinationTz,
      );
    }
    frames = steadyFrames(cbtMin, 1);
    sleepReason = () => "SLEEP_LOCAL_TIME";
  } else if (decision.direction === "short-trip") {
    const homeCbtMin = instantAt(departureDate, target, itinerary.homeTz);
    frames = steadyFrames(homeCbtMin, (itinerary.tripDays ?? 0) + 1);
    sleepReason = () => "SLEEP_HOME_TIME";
  } else {
    frames = shiftFrames(cbtMin0, decision, destinationTz);
    sleepReason = (f) => (f.shift > 0 ? "SLEEP_SHIFTING" : "SLEEP_SETTLED");
  }

  const shifting =
    decision.direction === "advance" || decision.direction === "delay";
  const direction = decision.shiftDirection;
  const melatoninAllowed =
    traveler.useMelatonin && traveler.melatoninContraindicated !== true;
  const days: PlanDay[] = frames.map((frame) => {
    builder.blocks = [];
    const wake = wakeOf(frame.cbtMin, phase);
    addBlock(
      builder,
      "SLEEP",
      sleepStartOf(frame.cbtMin, phase),
      wake,
      sleepReason(frame),
    );
    const shiftingToday = shifting && frame.shift > 0;
    if (shiftingToday) {
      lightBlocks(builder, frame, direction, phase);
      if (melatoninAllowed) {
        melatoninBlock(builder, frame, direction, phase, opts);
      }
    }
    if (shifting && traveler.exercise.enabled) {
      exerciseBlocks(
        builder,
        frame,
        direction,
        phase,
        Math.round(
          traveler.exercise.preferredMinutes ?? EXERCISE.defaultMinutes,
        ),
        shiftingToday,
      );
    }
    symptomBlocks(
      builder,
      frame,
      phase,
      input,
      shiftingToday && direction === "advance",
    );

    // Light-touch plans sit on destination time; the body is still |delta| off.
    const misalignment = (cbtMin: Instant): number =>
      decision.direction === "none"
        ? Math.abs(decision.deltaMinutes) / 60
        : Math.abs(signedMinutes(clockIn(cbtMin, destinationTz) - target)) / 60;
    return {
      date: wake.toZonedDateTimeISO(destinationTz).toPlainDate().toString(),
      localTzAtWake: builder.zoneAt(wake),
      cbtMinUtc: frame.cbtMin.toString(),
      blocks: sortBlocks(builder.blocks),
      misalignmentBefore: misalignment(frame.cbtMin),
      misalignmentAfter: shifting
        ? misalignment(frame.nextCbtMin)
        : misalignment(frame.cbtMin),
      effectiveShiftHours: frame.shift / 60,
      flags: [],
    };
  });

  // Days of the plan actually chosen: shift days, the days kept on home
  // time, or none.
  const chosenDays = shifting
    ? frames.length - 1
    : decision.direction === "short-trip"
      ? (itinerary.tripDays ?? 0)
      : 0;
  const result: Decision = {
    direction: decision.direction,
    deltaHours: decision.deltaMinutes / 60,
    daysAdvance: decision.daysAdvance,
    daysDelay: decision.daysDelay,
    chosenDays,
    targetCbtMinLocal: formatClock(target),
    explanation: explanation(decision, chosenDays, itinerary.tripDays),
  };
  return {
    decision: result,
    days,
    staticAdvice: [],
    warnings: builder.warnings,
    droppedBlocks: builder.dropped,
    engineVersion: ENGINE_VERSION,
  };
}
