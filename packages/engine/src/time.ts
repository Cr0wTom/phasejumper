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

// Instant and interval helpers. All engine time math goes through here.

import { Temporal } from "temporal-polyfill";

export type Instant = Temporal.Instant;

/** Half-open [start, end). */
export interface Interval {
  start: Instant;
  end: Instant;
}

export function compare(a: Instant, b: Instant): number {
  return Temporal.Instant.compare(a, b);
}

export function plus(instant: Instant, minutes: number): Instant {
  return instant.add({ minutes });
}

export function minutesBetween(a: Instant, b: Instant): number {
  return Math.round(b.since(a).total({ unit: "minutes" }));
}

export function earlier(a: Instant, b: Instant): Instant {
  return compare(a, b) <= 0 ? a : b;
}

export function later(a: Instant, b: Instant): Instant {
  return compare(a, b) >= 0 ? a : b;
}

export function length(i: Interval): number {
  return minutesBetween(i.start, i.end);
}

export function overlaps(a: Interval, b: Interval): boolean {
  return compare(a.start, b.end) < 0 && compare(b.start, a.end) < 0;
}

export function contains(i: Interval, at: Instant): boolean {
  return compare(i.start, at) <= 0 && compare(at, i.end) < 0;
}

export function intersection(a: Interval, b: Interval): Interval | undefined {
  const start = later(a.start, b.start);
  const end = earlier(a.end, b.end);
  return compare(start, end) < 0 ? { start, end } : undefined;
}

export function overlapMinutes(a: Interval, b: Interval): number {
  const i = intersection(a, b);
  return i === undefined ? 0 : length(i);
}

/** a minus every cut, as sorted non-empty segments. */
export function subtract(a: Interval, cuts: readonly Interval[]): Interval[] {
  let segments: Interval[] = [a];
  for (const cut of cuts) {
    segments = segments.flatMap((s) => {
      if (!overlaps(s, cut)) return [s];
      const parts: Interval[] = [];
      if (compare(s.start, cut.start) < 0) {
        parts.push({ start: s.start, end: cut.start });
      }
      if (compare(cut.end, s.end) < 0) {
        parts.push({ start: cut.end, end: s.end });
      }
      return parts;
    });
  }
  return segments;
}

/** The longest segment; the earliest one on a tie. */
export function longest(segments: readonly Interval[]): Interval | undefined {
  let best: Interval | undefined;
  for (const s of segments) {
    if (best === undefined || length(s) > length(best)) best = s;
  }
  return best;
}
