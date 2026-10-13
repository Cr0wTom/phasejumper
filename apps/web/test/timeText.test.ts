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
import { formatTimeForDisplay, parseTimeText } from "../src/timeText";

const accepted: readonly [string, string][] = [
  ["7", "07:00"],
  ["07", "07:00"],
  ["7:45", "07:45"],
  ["07:45", "07:45"],
  ["7.45", "07:45"],
  ["07.45", "07:45"],
  ["745", "07:45"],
  ["0745", "07:45"],
  ["7a", "07:00"],
  ["7 am", "07:00"],
  ["7A", "07:00"],
  ["7pm", "19:00"],
  ["7 pm", "19:00"],
  ["7P", "19:00"],
  ["7 p.m.", "19:00"],
  ["7a.m.", "07:00"],
  ["7 a.m.", "07:00"],
  ["7:45 pm", "19:45"],
  ["7:45pm", "19:45"],
  ["07:45 PM", "19:45"],
  ["7.45 p", "19:45"],
  ["745p", "19:45"],
  ["0745 pm", "19:45"],
  ["12 am", "00:00"],
  ["12 pm", "12:00"],
  ["12:00am", "00:00"],
  ["12:00 pm", "12:00"],
  ["12:30 AM", "00:30"],
  ["1:05 am", "01:05"],
  ["11:59 pm", "23:59"],
  ["12:01 am", "00:01"],
  ["0", "00:00"],
  ["00", "00:00"],
  ["0:00", "00:00"],
  ["00:00", "00:00"],
  ["23", "23:00"],
  ["23:59", "23:59"],
  ["2359", "23:59"],
  ["23.59", "23:59"],
  ["9:00", "09:00"],
  ["13", "13:00"],
  ["13:00", "13:00"],
  ["1300", "13:00"],
  ["  7:45 pm  ", "19:45"],
  ["7:45  pm", "19:45"],
  ["9:05a.m.", "09:05"],
  ["7:45a.m.", "07:45"],
  ["4.05 pm", "16:05"],
  ["1000A", "10:00"],
  ["1100A", "11:00"],
];

const rejected = [
  "",
  "abc",
  "25:00",
  "24:00",
  "7:60",
  "-1",
  "7:45:00",
  "13pm",
  "7 45",
  "０７:４５",
  "0 pm",
  "0pm",
  "00pm",
  "24",
  "2400",
  "7:5",
  "7:",
  "7.4",
  "am",
  "7:45 p.m.",
  "   ",
  "+7",
  "7:45 xm",
];

describe("parseTimeText", () => {
  it.each(accepted)("accepts %j as %s", (text, expected) => {
    expect(parseTimeText(text)).toBe(expected);
  });

  it.each(rejected)("rejects %j", (text) => {
    expect(parseTimeText(text)).toBeNull();
  });
});

describe("formatTimeForDisplay", () => {
  it("uses the locale hour cycle and round-trips through the parser", () => {
    expect(formatTimeForDisplay("19:45", "en-GB")).toBe("19:45");
    expect(formatTimeForDisplay("19:45", "en-US")).toBe("07:45 PM");
    expect(formatTimeForDisplay("00:00", "en-US")).toBe("12:00 AM");
    expect(formatTimeForDisplay("12:00", "en-US")).toBe("12:00 PM");
    for (const locale of ["en-GB", "en-US"]) {
      for (const value of ["00:00", "07:45", "12:00", "19:45", "23:15"]) {
        expect(parseTimeText(formatTimeForDisplay(value, locale))).toBe(value);
      }
    }
  });
});
