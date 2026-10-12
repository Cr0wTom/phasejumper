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

// §2.8 forecast. The plan's own CBTmin (and sleep windows) move by the
// planned shift, halved on a WEAK_DAY. The forecast additionally credits the
// exercise bonus (§2.5: it never changes the planned sleep window), so it is
// tracked separately and may reach the target a little sooner.

import type { RawBlock } from "./filter";
import { MINUTES_PER_DAY, offsetMinutes } from "./phase";
import { EXERCISE } from "./prc";
import { compare, plus, type Instant } from "./time";
import type { Direction } from "./types";

export interface ForecastState {
  /** Forecast CBTmin for the current day. */
  cbtMin: Instant;
  /** Forecast shift still needed, minutes. */
  remaining: number;
}

const BONUS_MINUTES = Math.round(EXERCISE.bonusShiftHours * 60);

/** 0.3 h when an EXERCISE_GOOD block lands fully inside a zone for the direction. */
export function exerciseBonusMinutes(
  blocks: readonly RawBlock[],
  cbtMin: Instant,
  direction: Direction,
): number {
  const zones =
    direction === "advance"
      ? [EXERCISE.advanceAfternoonZone, EXERCISE.advanceMorningZone]
      : [EXERCISE.delayZone];
  const inside = blocks.some(
    (b) =>
      b.kind === "EXERCISE_GOOD" &&
      zones.some(
        ([from, to]) =>
          compare(plus(cbtMin, from * 60), b.start) <= 0 &&
          compare(b.end, plus(cbtMin, to * 60)) <= 0,
      ),
  );
  return inside ? BONUS_MINUTES : 0;
}

export function forecastStep(
  state: ForecastState,
  day: {
    shift: number;
    bonus: number;
    rate: number;
    /** −1 advancing, +1 delaying. */
    sign: number;
    destinationTz: string;
  },
): { effectiveMinutes: number; next: ForecastState } {
  // Capped so a day never exceeds rate + 0.3 h, and never overshoots.
  const effectiveMinutes = Math.min(
    day.shift + day.bonus,
    day.rate + BONUS_MINUTES,
    state.remaining,
  );
  const cbtMin = plus(
    state.cbtMin,
    MINUTES_PER_DAY + day.sign * effectiveMinutes,
  );
  const offsetChange =
    offsetMinutes(cbtMin, day.destinationTz) -
    offsetMinutes(state.cbtMin, day.destinationTz);
  return {
    effectiveMinutes,
    next: {
      cbtMin,
      remaining: Math.max(
        0,
        state.remaining - effectiveMinutes - day.sign * offsetChange,
      ),
    },
  };
}
