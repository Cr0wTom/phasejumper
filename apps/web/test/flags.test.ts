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
import { bannedCopyPattern } from "../../../scripts/banned-terms";
import flags from "../src/flags.json";
import { messages } from "../src/messages";

// §11.4 health words + encoded third-party terms (scripts/banned-terms.ts).
const BANNED = bannedCopyPattern();

function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") {
    return [0, 1, 2, 3, 12].flatMap((count) => {
      const result: unknown = value(count);
      return typeof result === "string" ? [result] : [];
    });
  }
  return [];
}

describe("flags and copy", () => {
  it("ships every rollout flag off", () => {
    expect(flags).toEqual({
      "engine.exercise": false,
      "engine.meditation": false,
      "engine.meals": false,
      "engine.delayMelatonin": false,
      "engine.simulate": false,
      "flights.openskyLive": false,
      "legal.acceptanceGate": false,
      "melatonin.optIn": false,
    });
  });

  it("keeps user-facing strings free of banned words", () => {
    const strings = Object.values(messages).flatMap(stringsIn);
    expect(strings.length).toBeGreaterThan(10);
    for (const text of strings) {
      expect(text).not.toMatch(BANNED);
    }
    expect(messages.footer).toBe(
      "General wellness information, not medical advice. You use PhaseJumper at your own risk.",
    );
    expect(messages.melatonin).toBe(
      "I already use melatonin and want timing windows for it",
    );
  });
});
