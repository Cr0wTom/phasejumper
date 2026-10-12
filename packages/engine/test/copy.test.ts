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
import {
  ADVICE_CODES,
  DROP_CODES,
  REASON_CODES,
  WARNING_CODES,
  adviceCopy,
  droppedCopy,
  explanationCopy,
  reasonCopy,
  warningCopy,
} from "../src/index";

// §11.4 list, checked here for engine copy until the repo-wide check (T12).
const BANNED =
  /treat|cure|diagnos|prescri|therap|disorder|patient|dose|dosage|\bmg\b|notification|reminder|guarantee|clinically proven|medical-grade/i;

const all = [
  ...REASON_CODES.map(reasonCopy),
  ...WARNING_CODES.map(warningCopy),
  ...DROP_CODES.map(droppedCopy),
  ...ADVICE_CODES.map(adviceCopy),
  explanationCopy.lightTouch(1),
  explanationCopy.shortTrip({ tripDays: 2, shiftDays: 5 }),
  explanationCopy.shortTrip({ tripDays: 2, shiftDays: 1 }),
  ...[true, false].flatMap((forced) =>
    (["advance", "delay"] as const).map((direction) =>
      explanationCopy.shift({
        direction,
        shiftHours: 15,
        days: 8,
        otherShiftHours: 9,
        otherDays: 9,
        forced,
      }),
    ),
  ),
];

describe("engine copy", () => {
  it.each(all)("%s", (text) => {
    expect(text).not.toMatch(BANNED);
    expect(text.trim()).toBe(text);
    expect(text).toMatch(/[.]$/);
  });
});
